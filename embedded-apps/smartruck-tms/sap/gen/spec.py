# Single source of truth for the OData model of ZTMS_SRV: generates the types class and the model provider (same technique as ZLIFE_INS_SRV).
# prop: (EdmName, abap_component, kind, length, key, abap_type)
TYCLASS = 'ZCL_TMS_TY'
S = 'str'; D = 'dec'; DT = 'date'; I = 'int'
ENT = [
 dict(name='Vendor', set='VendorSet', create=False, props=[
  ('Lifnr','lifnr',S,10,True,'c'),('Name1','name1',S,35,False,'c'),('Ort01','ort01',S,35,False,'c'),('Stcd3','stcd3',S,18,False,'c'),
  ('Zterm','zterm',S,4,False,'c'),('Sperr','sperr',S,1,False,'c'),('Loevm','loevm',S,1,False,'c'),('Transporter','transporter',S,1,False,'c')]),
 dict(name='Customer', set='CustomerSet', create=False, props=[
  ('Kunnr','kunnr',S,10,True,'c'),('Name1','name1',S,35,False,'c'),('Ort01','ort01',S,35,False,'c'),('Regio','regio',S,3,False,'c'),('Zone','zone',S,20,False,'c')]),
 dict(name='PoSoCheck', set='PoSoCheckSet', create=False, props=[
  ('Po','po',S,10,True,'c'),('So','so',S,10,True,'c'),('Valid','valid',S,1,False,'c'),('Message','message',S,255,False,'c')]),
 # Create-only: POST runs check (Simulated = 'X') or posts the vendor invoice; idempotent by ExtRef (stored in BKPF-XBLNR).
 dict(name='FreightInvoice', set='FreightInvoiceSet', create=True, props=[
  ('ExtRef','extref',S,16,True,'c'),('Lifnr','lifnr',S,10,False,'c'),('Amount','amount',D,13,False,'p'),('Waers','waers',S,5,False,'c'),
  ('InvDate','invdate',DT,0,False,'d'),('Werks','werks',S,4,False,'c'),('Sin','sin',S,20,False,'c'),('Miro','miro',S,20,False,'c'),
  ('Simulated','simulated',S,1,False,'c'),('BelnrFi','belnrfi',S,10,False,'c'),('Gjahr','gjahr',S,4,False,'c'),('Bukrs','bukrs',S,4,False,'c'),
  ('Message','message',S,255,False,'c')]),
 dict(name='PaymentStatus', set='PaymentStatusSet', create=False, props=[
  ('Belnr','belnr',S,10,True,'c'),('Cleared','cleared',S,1,False,'c'),('Augbl','augbl',S,10,False,'c'),('Augdt','augdt',DT,0,False,'d'),('Gjahr','gjahr',S,4,False,'c')]),
 # Outward tracking (read only). Outbound delivery with carton data and e-invoice / e-way bill status; ECC shipment with its linked deliveries and cost; lane freight.
 dict(name='OutDelivery', set='OutDeliverySet', create=False, props=[
  ('Vbeln','vbeln',S,10,True,'c'),('Werks','werks',S,4,False,'c'),('Kunnr','kunnr',S,10,False,'c'),('ShipToName','shiptoname',S,35,False,'c'),
  ('Cartons','cartons',D,13,False,'p'),('GrossWeightKg','grossweightkg',D,13,False,'p'),('VolumeM3','volumem3',D,13,False,'p'),
  ('Pgi','pgi',S,1,False,'c'),('Route','route',S,6,False,'c'),('Irn','irn',S,64,False,'c'),('EwbNo','ewbno',S,20,False,'c'),('EwbValid','ewbvalid',DT,0,False,'d')]),
 dict(name='OutShipment', set='OutShipmentSet', create=False, props=[
  ('Tknum','tknum',S,10,True,'c'),('Shtyp','shtyp',S,4,False,'c'),('Tdlnr','tdlnr',S,10,False,'c'),('Route','route',S,6,False,'c'),('Vbelns','vbelns',S,255,False,'c'),
  ('CostNet','costnet',D,13,False,'p'),('CostTax','costtax',D,13,False,'p'),('Waers','waers',S,5,False,'c'),('CostStatus','coststatus',S,1,False,'c')]),
 dict(name='Lane', set='LaneSet', create=False, props=[
  ('FromLoc','fromloc',S,20,True,'c'),('ToLoc','toloc',S,20,True,'c'),('Lifnr','lifnr',S,10,True,'c'),('Rate','rate',D,13,False,'p'),
  ('Distance','distance',D,13,False,'p'),('TransitH','transith',D,13,False,'p'),('Priority','priority',S,2,False,'c')]),
]
ASSOC = []
ACT = []
