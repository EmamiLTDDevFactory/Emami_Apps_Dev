"""Adds the maintenance entities MaintRow / MaintCmd (+ association Rows) to a code-based model provider source
(ZCL_ZMEDICLAIM_MPC or ZCL_ZLIFE_INS_MPC). Idempotent: does nothing when the entities are already there.
Usage: python3 maint_mpc.py <mpc.abap>. Structures are bound to ZCL_INS_MAINT=>TS_ROW / TS_CMD (see zcl_ins_maint.abap)."""
import sys
ENT=[
 ('MaintRow','MaintRowSet',False,'TS_ROW',[('Email','EMAIL',241,True),('Table','TAB',10,True),('Key1','KEY1',40,True),('Key2','KEY2',40,True),('Key3','KEY3',40,True),
   ('Year','YEAR',4,False),('Val1','VAL1',60,False),('Val2','VAL2',60,False),('Val3','VAL3',60,False),('Val4','VAL4',60,False),('Val5','VAL5',60,False)]),
 ('MaintCmd','MaintCmdSet',True,'TS_CMD',[('Email','EMAIL',241,True),('Table','TAB',10,True),('Year','YEAR',4,False),('ToYear','TOYEAR',4,False),
   ('Action','ACTION',10,False),('Ok','OK',1,False),('Message','MESSAGE',255,False),('Count','COUNT',0,False)]),
]
def entities():
    m=['    " ---- maintenance entities MaintRow / MaintCmd (zcl_ins_maint)']
    for name,sset,create,ts,props in ENT:
        m.append("    lo_entity_type = model->create_entity_type( iv_entity_type_name = '%s' iv_def_entity_set = abap_false )."%name)
        for n,f,ln,key in props:
            m.append("    lo_property = lo_entity_type->create_property( iv_property_name = '%s' iv_abap_fieldname = '%s' )."%(n,f))
            if key: m.append('    lo_property->set_is_key( ).')
            if ln: m+=['    lo_property->set_type_edm_string( ).','    lo_property->set_maxlength( iv_max_length = %d ).'%ln]
            else: m.append('    lo_property->set_type_edm_int32( ).')
            if key: m.append('    lo_property->set_nullable( abap_false ).')
        m.append("    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_INS_MAINT=>%s' iv_bind_conversions = abap_false )."%ts)
        m.append("    lo_entity_set = lo_entity_type->create_entity_set( '%s' )."%sset)
        m.append('    lo_entity_set->set_creatable( %s ).'%('abap_true' if create else 'abap_false'))
        for s in ('updatable','deletable','pageable'): m.append('    lo_entity_set->set_%s( abap_false ).'%s)
        m+=['    lo_entity_set->set_addressable( abap_true ).','    lo_entity_set->set_has_ftxt_search( abap_false ).','    lo_entity_set->set_subscribable( abap_false ).','    lo_entity_set->set_filter_required( abap_false ).','']
    return '\n'.join(m)+'\n'
def assoc():
    return """    lo_association = model->create_association( iv_association_name = 'MaintCmd_Rows' iv_left_type = 'MaintCmd' iv_right_type = 'MaintRow' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_ref_constraint = lo_association->create_ref_constraint( ).
    lo_ref_constraint->add_property( iv_principal_property = 'Email' iv_dependent_property = 'Email' ).
    lo_ref_constraint->add_property( iv_principal_property = 'Table' iv_dependent_property = 'Table' ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'MaintCmd_Rows_AssocSet' iv_left_entity_set_name = 'MaintCmdSet' iv_right_entity_set_name = 'MaintRowSet' iv_association_name = 'MaintCmd_Rows' ).
    lo_entity_type = model->get_entity_type( 'MaintCmd' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Rows' iv_association_name = 'MaintCmd_Rows' iv_abap_fieldname = 'ROWS' ).
"""
def splice(t, stamp):
    if "'MaintCmd'" in t: return t
    a="  ENDMETHOD.\n\n  METHOD define_associations."
    b="  ENDMETHOD.\n\n  METHOD define_actions."
    assert t.count(a)==1 and t.count(b)==1, 'markers not found'
    t=t.replace(a,"\n"+entities()+a).replace(b,"\n"+assoc()+b)
    import re
    t=re.sub(r"(lc_gen_date_time TYPE timestamp VALUE ')\d+(')",r"\g<1>%s\2"%stamp,t)
    return t
if __name__=='__main__':
    p=sys.argv[1]; s=open(p).read(); n=splice(s,'20261120120000'); open(p,'w').write(n); print('patched' if n!=s else 'unchanged')
