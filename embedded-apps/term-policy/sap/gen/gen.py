import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spec import *
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+os.sep
def abap_t(k,ln,t):
    if t=='c': return 'c LENGTH %d'%ln
    if t=='p': return 'p LENGTH 7 DECIMALS 2'
    return t
# ---------------- types class
o=['CLASS %s DEFINITION PUBLIC FINAL CREATE PUBLIC.'%TYCLASS.lower(),
   '* Structure types of the OData service ZLIFE_INS_SRV (bound by the code-based model ZCL_ZLIFE_INS_MPC). Generated from gen/spec.py.',
   '  PUBLIC SECTION.','    TYPES:']
parts=[]
for e in ENT:
    f=['        %s TYPE %s'%(p[1],abap_t(p[2],p[3],p[5])) for p in e['props']]
    parts.append('      BEGIN OF ts_%s,\n%s,\n      END OF ts_%s'%(e['name'].lower(),',\n'.join(f),e['name'].lower()))
    parts.append('      tt_%s TYPE STANDARD TABLE OF ts_%s WITH DEFAULT KEY'%(e['name'].lower(),e['name'].lower()))
def deep(base,extra,nm):
    e=[x for x in ENT if x['name']==base][0]
    f=['        %s TYPE %s'%(p[1],abap_t(p[2],p[3],p[5])) for p in e['props']]+['        %s'%extra]
    return '      BEGIN OF ts_%s,\n%s,\n      END OF ts_%s'%(nm,',\n'.join(f),nm)
parts.append(deep('Policy','nominees TYPE tt_nominee','policy_deep'))
parts.append(deep('LimitUpload','rows TYPE tt_limitrow','limitupload_deep'))
o.append(',\n'.join(parts)+'.')
o+=['ENDCLASS.','','CLASS %s IMPLEMENTATION.'%TYCLASS.lower(),'ENDCLASS.','']
open(OUT+'zcl_life_ins_ty.abap','w').write('\n'.join(o))
# ---------------- MPC
def prop(kind,ln,t):
    L=[]
    if kind==S: L+=['    lo_property->set_type_edm_string( ).','    lo_property->set_maxlength( iv_max_length = %d ).'%ln]
    elif kind==D: L+=['    lo_property->set_type_edm_decimal( ).','    lo_property->set_precison( iv_precision = 2 ).','    lo_property->set_maxlength( iv_max_length = 13 ).']
    elif kind==DT: L+=['    lo_property->set_type_edm_datetime( ).',"    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' )."]
    elif kind==I: L+=['    lo_property->set_type_edm_int32( ).']
    return L
m=['"! Model provider of OData service ZLIFE_INS_SRV (code based, no SEGW project). Entity structures live in ZCL_LIFE_INS_TY. Generated from gen/spec.py.',
'CLASS zcl_zlife_ins_mpc DEFINITION PUBLIC INHERITING FROM /iwbep/cl_mgw_abs_model CREATE PUBLIC.',
'  PUBLIC SECTION.',"    CONSTANTS gc_schema_namespace TYPE string VALUE 'ZLIFE_INS_SRV'.",'    METHODS define REDEFINITION.','    METHODS get_last_modified REDEFINITION.',
'  PROTECTED SECTION.','    METHODS define_entities RAISING /iwbep/cx_mgw_med_exception.','    METHODS define_associations RAISING /iwbep/cx_mgw_med_exception.','    METHODS define_actions RAISING /iwbep/cx_mgw_med_exception.',
'ENDCLASS.','','CLASS zcl_zlife_ins_mpc IMPLEMENTATION.','  METHOD define.','    model->set_schema_namespace( gc_schema_namespace ).','    define_entities( ).','    define_associations( ).','    define_actions( ).','  ENDMETHOD.','',
'  METHOD get_last_modified.',"    CONSTANTS lc_gen_date_time TYPE timestamp VALUE '20261118180000'.",'    rv_last_modified = super->get_last_modified( ).','    IF rv_last_modified < lc_gen_date_time.','      rv_last_modified = lc_gen_date_time.','    ENDIF.','  ENDMETHOD.','',
'  METHOD define_entities.','    DATA: lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,','          lo_property    TYPE REF TO /iwbep/if_mgw_odata_property,','          lo_entity_set  TYPE REF TO /iwbep/if_mgw_odata_entity_set.','']
for e in ENT:
    m.append("    lo_entity_type = model->create_entity_type( iv_entity_type_name = '%s' iv_def_entity_set = abap_false )."%e['name'])
    for (n,f,k,ln,key,t) in e['props']:
        m.append("    lo_property = lo_entity_type->create_property( iv_property_name = '%s' iv_abap_fieldname = '%s' )."%(n,f.upper()))
        if key: m.append('    lo_property->set_is_key( ).')
        m+=prop(k,ln,t)
        if key: m.append('    lo_property->set_nullable( abap_false ).')
    m.append("    lo_entity_type->bind_structure( iv_structure_name = '%s=>TS_%s' iv_bind_conversions = abap_false )."%(TYCLASS,e['name'].upper()))
    m.append("    lo_entity_set = lo_entity_type->create_entity_set( '%s' )."%e['set'])
    m.append('    lo_entity_set->set_creatable( %s ).'%('abap_true' if e['create'] else 'abap_false'))
    for s in ('updatable','deletable','pageable'): m.append('    lo_entity_set->set_%s( abap_false ).'%s)
    m+=['    lo_entity_set->set_addressable( abap_true ).','    lo_entity_set->set_has_ftxt_search( abap_false ).','    lo_entity_set->set_subscribable( abap_false ).','    lo_entity_set->set_filter_required( abap_false ).','']
m+=['  ENDMETHOD.','','  METHOD define_associations.','    DATA: lo_association TYPE REF TO /iwbep/if_mgw_odata_assoc,','          lo_ref_constraint TYPE REF TO /iwbep/if_mgw_odata_ref_constr,','          lo_assoc_set TYPE REF TO /iwbep/if_mgw_odata_assoc_set,','          lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,','          lo_nav TYPE REF TO /iwbep/if_mgw_odata_nav_prop.','']
for (a,lt,rt,ls,rs,nav,navf,cons) in ASSOC:
    m.append("    lo_association = model->create_association( iv_association_name = '%s' iv_left_type = '%s' iv_right_type = '%s' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false )."%(a,lt,rt))
    m.append('    lo_ref_constraint = lo_association->create_ref_constraint( ).')
    for c in cons: m.append("    lo_ref_constraint->add_property( iv_principal_property = '%s' iv_dependent_property = '%s' )."%(c,c))
    m.append("    lo_assoc_set = model->create_association_set( iv_association_set_name = '%s_AssocSet' iv_left_entity_set_name = '%s' iv_right_entity_set_name = '%s' iv_association_name = '%s' )."%(a,ls,rs,a))
    m.append("    lo_entity_type = model->get_entity_type( '%s' )."%lt)
    m.append("    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = '%s' iv_association_name = '%s' iv_abap_fieldname = '%s' )."%(nav,a,navf))
    m.append('')
m+=['  ENDMETHOD.','','  METHOD define_actions.','    DATA: lo_action TYPE REF TO /iwbep/if_mgw_odata_action,','          lo_parameter TYPE REF TO /iwbep/if_mgw_odata_parameter.','']
for (n,rt,rs,ps) in ACT:
    m+=["    lo_action = model->create_action( '%s' )."%n,"    lo_action->set_return_entity_type( '%s' )."%rt,"    lo_action->set_return_entity_set( '%s' )."%rs,"    lo_action->set_return_multiplicity( '1' ).","    lo_action->set_http_method( 'POST' )."]
    for (pn,pf,k,ln) in ps:
        m+=["    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = '%s' iv_abap_fieldname = '%s' )."%(pn,pf.upper()),'    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).','    lo_parameter->set_maxlength( iv_max_length = %d ).'%ln]
    m.append('')
m+=['  ENDMETHOD.','ENDCLASS.','']
open(OUT+'zcl_zlife_ins_mpc.abap','w').write('\n'.join(m))
print('ok',len(m))
