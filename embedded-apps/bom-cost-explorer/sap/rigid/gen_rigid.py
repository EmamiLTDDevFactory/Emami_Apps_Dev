"""Generates the structure, MPC define method and field list of the ZRIGID read-only entity set (RigidSet). Run: python3 gen_rigid.py"""
import os
H=os.path.dirname(os.path.abspath(__file__))
S=[('grain',1),('rowid',12),('matnr',18),('maktx',40),('werks',4),('mould',18),('mould_txt',40),('mds',10),('design',40),('mcat',4),('mcat_txt',40),
   ('lifnr',10),('vendor',35),('mach',4),('mach_txt',40),('flag',10),('msg',120),('gjahr',4),('uname',12),('infnr',10),('comp',18),('comp_txt',40),
   ('gewei',3),('origin',10),('meins',3),('waers',5),('category',10),('mode',1)]
D=['valid_from','valid_to','crt_date']
I=['nmould']
N=['ntgew','run_cavity','cyc_time','hours_day','fac_prod','tot_out','tot_out_mon','kansw','nafag','zujhr','open_pr','zmrt','conv_cost','mat_cost','zmbx','zmpb','zmtp','zppb','zppb_t',
   'zmac','zmat','zitc','zmar','zehp','zwad','zdaj','zmfg','land_rate','comp_qty','bom_qty','dos_perc','dos_perc_s','scrap_pct','zpbr','zmds','zmfr','comp_cost',
   'budqty','basic','disc_amt','tax_amt','frg_amt','freight','landed','total','r_sap','r_used','f_used','cbr','cbud','br','var_pct','landed_rate','frt_total']
def camel(n): return ''.join(p.capitalize() for p in n.split('_'))
# structure
ty={'matnr':'matnr','maktx':'maktx','mould':'matnr','mould_txt':'maktx','werks':'werks_d'}
ddl=["@EndUserText.label : 'Rigid packing (ZRIGID): read-only row'","@AbapCatalog.enhancementCategory : #NOT_EXTENSIBLE","define type zrigid_s_row {"]
for n,l in S: ddl.append(f"  {n:<12}: {ty.get(n, f'abap.char({l})')};")
for n in D: ddl.append(f"  {n:<12}: dats;")
for n in I: ddl.append(f"  {n:<12}: abap.int4;")
for n in N: ddl.append(f"  {n:<12}: abap.dec(23,6);")
ddl.append("}")
open(H+'/zrigid_s_row.ddls.txt','w').write('\n'.join(ddl)+'\n')
# mpc define
m=["  METHOD rigid_define.","    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,","          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,","          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.",
   "    lo_et = model->create_entity_type( iv_entity_type_name = 'Rigid' iv_def_entity_set = abap_false )."]
for n,l in S:
    key = n=='rowid'
    if n in ('matnr','werks','gjahr','mode'):
        m+= [f"    lo_p = lo_et->create_property( iv_property_name = '{camel(n)}' iv_abap_fieldname = '{n.upper()}' ).","    lo_p->set_type_edm_string( ).",f"    lo_p->set_maxlength( iv_max_length = {l} ).",
             "    lo_p->set_creatable( abap_false ).","    lo_p->set_updatable( abap_false ).","    lo_p->set_sortable( abap_false ).","    lo_p->set_nullable( abap_false ).","    lo_p->set_filterable( abap_true )."]
    else:
        m.append(f"    dash_str( io_et = lo_et iv_name = '{camel(n)}' iv_field = '{n.upper()}' iv_len = {l} iv_key = {'abap_true' if key else 'abap_false'} ).")
for n in D:
    m+= [f"    lo_p = lo_et->create_property( iv_property_name = '{camel(n)}' iv_abap_fieldname = '{n.upper()}' ).","    lo_p->set_type_edm_datetime( ).","    lo_p->set_precison( iv_precision = 7 ).",
         "    lo_p->set_creatable( abap_false ).","    lo_p->set_updatable( abap_false ).","    lo_p->set_sortable( abap_false ).","    lo_p->set_nullable( abap_true ).","    lo_p->set_filterable( abap_false )."]
for n in I:
    m+= [f"    lo_p = lo_et->create_property( iv_property_name = '{camel(n)}' iv_abap_fieldname = '{n.upper()}' ).","    lo_p->set_type_edm_int32( ).","    lo_p->set_creatable( abap_false ).","    lo_p->set_updatable( abap_false ).","    lo_p->set_sortable( abap_false ).","    lo_p->set_nullable( abap_false ).","    lo_p->set_filterable( abap_false )."]
for n in N: m.append(f"    dash_dec( io_et = lo_et iv_name = '{camel(n)}' iv_field = '{n.upper()}' iv_len = 23 iv_scale = 6 ).")
m+= ["    lo_et->bind_structure( iv_structure_name = 'ZRIGID_S_ROW' iv_bind_conversions = 'X' ).","    lo_es = lo_et->create_entity_set( 'RigidSet' ).","    lo_es->set_creatable( abap_false ).","    lo_es->set_updatable( abap_false ).",
     "    lo_es->set_deletable( abap_false ).","    lo_es->set_pageable( abap_false ).","    lo_es->set_addressable( abap_true ).","    lo_es->set_has_ftxt_search( abap_false ).","  ENDMETHOD."]
open(H+'/mpc_rigid_define.abap','w').write('\n'.join(m)+'\n')
# frontend field map
f=["export const RIGID_FIELDS = {"]
f.append('  '+', '.join(f"{camel(n)}: ['{camel(n)}', 's']" for n,l in S)+',')
f.append('  '+', '.join(f"{camel(n)}: ['{camel(n)}', 't']" for n in D)+',')
f.append('  '+', '.join(f"{camel(n)}: ['{camel(n)}', 'i']" for n in I)+',')
f.append('  '+', '.join(f"{camel(n)}: ['{camel(n)}', 'd']" for n in N)+',')
f.append("} as const satisfies FieldMap;")
open(H+'/rigid_fields.ts.txt','w').write('\n'.join(f)+'\n')
print(len(S)+len(D)+len(I)+len(N),"properties")
