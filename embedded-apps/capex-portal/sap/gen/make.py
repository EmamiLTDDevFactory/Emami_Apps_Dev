import re, sys
E='eds/'; N='new/'
EFF='zcl_capex_auth=>effective_user( )'

def swap(src):
    out=[]
    for ln in src.split('\n'):
        if ln.lstrip().startswith('*') or 'sy-uname' not in ln.lower():
            out.append(ln); continue
        ln=re.sub(r'@sy-uname', '@( '+EFF+' )', ln, flags=re.I)
        ln=re.sub(r'sy-uname', EFF, ln, flags=re.I)
        out.append(ln)
    return '\n'.join(out)

# 1. plain classes
for c in ['BUDDOC','CPE','DOC','IC','LOG','QUOTA','SAP','WF']:
    s=open(f'{E}cls_ZCL_CAPEX_{c}.abap').read()
    open(f'{N}zcl_capex_{c.lower()}.abap','w').write(swap(s))

# 2. auth class
a=open(E+'zcl_capex_auth.abap').read()
a=a.replace('DEFAULT sy-uname','OPTIONAL')
a=a.replace("""  PRIVATE SECTION.
    TYPES: BEGIN OF ty_plant,""","""    "! Business user for this request. The gateway signs in as one technical user; when the hub sends a
    "! trusted e-mail (query options zcpxmail + zcpxkey, key checked against config PROXY_SECRET, caller must be
    "! listed in PROXY_USERS, default WDA_AUDIT) the matching active ZCAPEX_USER row is the effective user.
    "! Anything else (Fiori, no e-mail, wrong key, no secret configured) returns sy-uname, exactly as before.
    CLASS-METHODS effective_user
      RETURNING VALUE(rv_user) TYPE xubname.
    "! Called once per OData request by the data provider with the raw query options.
    CLASS-METHODS set_proxy_identity
      IMPORTING iv_email TYPE string OPTIONAL
                iv_key   TYPE string OPTIONAL.
  PRIVATE SECTION.
    CLASS-DATA gv_email    TYPE string.
    CLASS-DATA gv_key      TYPE string.
    CLASS-DATA gv_resolved TYPE abap_bool.
    CLASS-DATA gv_user     TYPE xubname.
    TYPES: BEGIN OF ty_plant,""",1)
# implementations
def rep(name,new):
    global a
    m=re.search(r'  METHOD %s\.\n.*?  ENDMETHOD\.\n'%name,a,re.S)
    assert m,name
    a=a[:m.start()]+new+a[m.end():]
rep('can_see_plant','''  METHOD can_see_plant.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    IF ls_user-active = abap_false.
      RETURN.
    ENDIF.
    IF ls_user-is_global = abap_true.
      rv_allowed = abap_true.
      RETURN.
    ENDIF.
    load_plants( lv_uid ).
    rv_allowed = xsdbool( line_exists( gt_plants[ userid = lv_uid werks = iv_werks ] ) ).
  ENDMETHOD.
''')
rep('get_user','''  METHOD get_user.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    READ TABLE gt_users INTO rs_user WITH TABLE KEY userid = lv_uid.
    IF sy-subrc <> 0.
      SELECT SINGLE * FROM zcapex_user INTO @rs_user WHERE userid = @lv_uid.
      IF sy-subrc = 0.
        INSERT rs_user INTO TABLE gt_users.
      ELSE.
        CLEAR rs_user.
      ENDIF.
    ENDIF.
  ENDMETHOD.
''')
rep('has_any_role','''  METHOD has_any_role.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    SPLIT iv_roles AT ',' INTO TABLE DATA(lt_roles).
    LOOP AT lt_roles INTO DATA(lv_role).
      CONDENSE lv_role.
      IF has_role( iv_userid = lv_uid iv_role = CONV #( lv_role ) ) = abap_true.
        rv_has = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
''')
rep('has_role','''  METHOD has_role.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    rv_has = xsdbool( ls_user-active = abap_true AND ls_user-role = iv_role ).
  ENDMETHOD.
''')
rep('is_admin','''  METHOD is_admin.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    rv_admin = xsdbool( ls_user-active = abap_true AND ls_user-is_admin = abap_true ).
  ENDMETHOD.
''')
rep('plants_of','''  METHOD plants_of.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    load_plants( lv_uid ).
    LOOP AT gt_plants INTO DATA(ls_plant) WHERE userid = lv_uid.
      APPEND ls_plant-werks TO rt_werks.
    ENDLOOP.
  ENDMETHOD.
''')
extra='''

  METHOD set_proxy_identity.
    gv_email = condense( iv_email ).
    gv_key = iv_key.
    CLEAR: gv_resolved, gv_user.
  ENDMETHOD.


  METHOD effective_user.
    rv_user = sy-uname.
    IF gv_email IS INITIAL.
      RETURN.
    ENDIF.
    IF gv_resolved = abap_true.
      IF gv_user IS NOT INITIAL.
        rv_user = gv_user.
      ENDIF.
      RETURN.
    ENDIF.
    gv_resolved = abap_true.

    " 1. The shared secret must be configured and match; otherwise the e-mail channel is off.
    DATA(lv_secret) = condense( CONV string( zcl_capex_config=>get( 'PROXY_SECRET' ) ) ).
    IF lv_secret IS INITIAL OR gv_key <> lv_secret.
      RETURN.
    ENDIF.

    " 2. Only the listed technical user(s) may speak for someone else.
    DATA(lv_trusted) = condense( CONV string( zcl_capex_config=>get( 'PROXY_USERS' ) ) ).
    IF lv_trusted IS INITIAL.
      lv_trusted = `WDA_AUDIT`.
    ENDIF.
    SPLIT lv_trusted AT ',' INTO TABLE DATA(lt_trusted).
    DATA(lv_ok) = abap_false.
    LOOP AT lt_trusted INTO DATA(lv_t).
      IF to_upper( condense( lv_t ) ) = sy-uname.
        lv_ok = abap_true.
      ENDIF.
    ENDLOOP.
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.

    " 3. Exactly one active user row with this e-mail; anything else gets no privileges (the technical user).
    SELECT userid, email, active FROM zcapex_user INTO TABLE @DATA(lt_users).
    DATA(lv_mail) = to_upper( gv_email ).
    DATA(lv_hits) = 0.
    DATA lv_found TYPE xubname.
    LOOP AT lt_users INTO DATA(ls_u).
      IF ls_u-active = abap_true AND to_upper( condense( CONV string( ls_u-email ) ) ) = lv_mail.
        lv_hits = lv_hits + 1.
        lv_found = ls_u-userid.
      ENDIF.
    ENDLOOP.
    IF lv_hits = 1.
      gv_user = lv_found.
      rv_user = lv_found.
    ENDIF.
  ENDMETHOD.
'''
a=a.rstrip()
assert a.endswith('ENDCLASS.')
a=a[:-len('ENDCLASS.')].rstrip()+extra+'ENDCLASS.\n'
open(N+'zcl_capex_auth.abap','w').write(a)

# 3. DPC_EXT
d=open(E+'zcl_zcapex_portal_dpc_ext.abap').read()
d=swap(d)
IF='/iwbep/if_mgw_appl_srv_runtime~'
# capture calls at the top of the 4 existing redefinitions
for m in ['create_deep_entity','create_stream','execute_action','get_stream','get_entity','get_entityset']:
    pat='  METHOD '+IF+m+'.\n'
    assert pat in d,m
    d=d.replace(pat,pat+'    capture_identity( ).\n',1)
# new redefinitions: parse interface signatures
rt=open(E+'if_rt.abap').read()
def sig(name):
    m=re.search(r'  methods %s\n(.*?)\n    raising'%name,rt,re.S)
    body=m.group(1)
    imp=re.findall(r'!(\w+) type',body.split('exporting')[0])
    exp=re.findall(r'!(\w+) type',body.split('exporting')[1]) if 'exporting' in body else []
    return imp,exp
new_defs=''; new_impls=''
for m in ['CREATE_ENTITY','UPDATE_ENTITY','DELETE_ENTITY']:
    imp,exp=sig(m)
    new_defs+=f'  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~{m}\n    redefinition .\n'
    call='    super->'+IF+m.lower()+'(\n'
    if imp: call+='      EXPORTING\n'+''.join(f'        {i.lower()} = {i.lower()}\n' for i in imp)
    if exp: call+='      IMPORTING\n'+''.join(f'        {e.lower()} = {e.lower()}\n' for e in exp)
    call=call.rstrip('\n')+' ).\n'
    new_impls+=f'\n\n  METHOD {IF}{m.lower()}.\n    capture_identity( ).\n{call}  ENDMETHOD.\n'
d=d.replace('public section.\n','public section.\n\n'+new_defs,1)
d=d.replace('private section.\n','private section.\n\n  methods CAPTURE_IDENTITY .\n',1)
capture='''

  METHOD capture_identity.
    DATA: lv_email TYPE string,
          lv_key   TYPE string.
    IF mr_request_details IS BOUND.
      " The custom query options may sit in any of these tables depending on the request kind.
      DATA(lt_all) = mr_request_details->*-parameters.
      APPEND LINES OF mr_request_details->*-uri_parameters TO lt_all.
      APPEND LINES OF mr_request_details->*-technical_request-parameters TO lt_all.
      APPEND LINES OF mr_request_details->*-technical_request-action_parameters TO lt_all.
      LOOP AT lt_all ASSIGNING FIELD-SYMBOL(<ls_prm>).
        CASE to_lower( <ls_prm>-name ).
          WHEN 'zcpxmail'. lv_email = <ls_prm>-value.
          WHEN 'zcpxkey'.  lv_key   = <ls_prm>-value.
        ENDCASE.
      ENDLOOP.
      " Custom (non-system) URI query options are kept in this table.
      LOOP AT mr_request_details->*-t_uri_query_parameter ASSIGNING FIELD-SYMBOL(<ls_qry>).
        CASE to_lower( <ls_qry>-name ).
          " Query values are kept percent-encoded by the framework (amit%40x.com): decode them.
          WHEN 'zcpxmail'. lv_email = cl_http_utility=>unescape_url( <ls_qry>-value ).
          WHEN 'zcpxkey'.  lv_key   = cl_http_utility=>unescape_url( <ls_qry>-value ).
        ENDCASE.
      ENDLOOP.
    ENDIF.
    zcl_capex_auth=>set_proxy_identity( iv_email = lv_email iv_key = lv_key ).
  ENDMETHOD.
'''

d=d.rstrip()
assert d.endswith('ENDCLASS.')
d=d[:-len('ENDCLASS.')].rstrip()+capture+new_impls+'\nENDCLASS.\n'
open(N+'zcl_zcapex_portal_dpc_ext.abap','w').write(d)

# strict-mode SELECT: INTO must be last when a host expression is used
def fix_into(src):
    pat=re.compile(r'(SELECT COUNT\(\*\) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid)\n\s*INTO @DATA\(lv_n_eval\)(.*?OR c~role = @lv_role_me \))\.',re.S)
    return pat.sub(lambda m:m.group(1)+m.group(2)+'\n          INTO @DATA(lv_n_eval).',src)
for f in ['zcl_capex_cpe','zcl_zcapex_portal_dpc_ext']:
    t=open(N+f+'.abap').read(); t2=fix_into(t); print(f,'fixed',t!=t2); open(N+f+'.abap','w').write(t2)
t=open(N+'zcl_zcapex_portal_dpc_ext.abap').read()
old='''    SELECT * FROM zcapex_notlog INTO TABLE @DATA(lt_db)
      WHERE recipient = @( zcl_capex_auth=>effective_user( ) )
      ORDER BY sent_ts DESCENDING.'''
new='''    SELECT * FROM zcapex_notlog
      WHERE recipient = @( zcl_capex_auth=>effective_user( ) )
      ORDER BY sent_ts DESCENDING
      INTO TABLE @DATA(lt_db).'''
assert old in t; open(N+'zcl_zcapex_portal_dpc_ext.abap','w').write(t.replace(old,new))
print('ok')
