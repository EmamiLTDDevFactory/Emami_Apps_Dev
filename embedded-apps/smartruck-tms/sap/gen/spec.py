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
 # Lane freight = SD shipment-cost condition ZB00 (tables A964 / A973 / A972 via CDS ZI_TMS_LANERATE), one row per valid condition record.
 dict(name='Lane', set='LaneSet', create=False, props=[
  ('Knumh','knumh',S,10,True,'c'),('CondTable','condtable',S,4,True,'c'),('Kschl','kschl',S,4,False,'c'),('Shtyp','shtyp',S,4,False,'c'),
  ('Route','route',S,6,False,'c'),('RouteText','routetext',S,40,False,'c'),('FromLoc','fromloc',S,20,False,'c'),('ToLoc','toloc',S,20,False,'c'),
  ('VehicleType','vehicletype',S,10,False,'c'),('VehicleText','vehicletext',S,40,False,'c'),('RateBasis','ratebasis',S,10,False,'c'),
  ('Sdabw','sdabw',S,4,False,'c'),('Vsart','vsart',S,2,False,'c'),('VsartText','vsarttext',S,20,False,'c'),('ZDays','zdays',S,4,False,'c'),
  ('Lifnr','lifnr',S,10,False,'c'),('VendorName','vendorname',S,35,False,'c'),('Rate','rate',D,13,False,'p'),('Waers','waers',S,5,False,'c'),
  ('PerQty','perqty',D,13,False,'p'),('PerUnit','perunit',S,3,False,'c'),('CalcType','calctype',S,1,False,'c'),
  ('ValidFrom','validfrom',DT,0,False,'d'),('ValidTo','validto',DT,0,False,'d'),
  ('Distance','distance',D,13,False,'p'),('TransitH','transith',D,13,False,'p'),('Priority','priority',S,2,False,'c')]),
 # Instavans replacement (ZSMART_VEH). Billing documents on a trip vehicle, computed like ZSMART_VEH (cases in KAR without inside-pack scheme items,
 # value incl. tax, kg); TtSin = Trip Trail vehicle already holding it, InstaSin = Instavans vehicle (parallel run, read only).
 dict(name='TripInvoice', set='TripInvoiceSet', create=False, props=[
  ('Vbeln','vbeln',S,10,True,'c'),('Vbelv','vbelv',S,10,False,'c'),('Werks','werks',S,4,False,'c'),('Fkdat','fkdat',DT,0,False,'d'),
  ('Kunnr','kunnr',S,10,False,'c'),('Name1','name1',S,35,False,'c'),('Cancelled','cancelled',S,1,False,'c'),
  ('Cases','cases',D,13,False,'p'),('Value','value',D,13,False,'p'),('Waers','waers',S,5,False,'c'),('GrossKg','grosskg',D,13,False,'p'),('NetKg','netkg',D,13,False,'p'),
  ('TtSin','ttsin',S,50,False,'c'),('TtVehicle','ttvehicle',S,15,False,'c'),('InstaSin','instasin',S,50,False,'c'),('InstaVehicle','instavehicle',S,15,False,'c'),
  ('Message','message',S,255,False,'c')]),
 # Create-only, idempotent: Invoices = the vehicle's COMPLETE current list (comma separated); SAP adds, refreshes and flags removed ones (LOEKZ).
 # Writes ZTMS_TRIP_VEH / ZTMS_TRIP_INV; ZINSTA_VEHICLE_H/I only when TVARVC ZTMS_INSTA_WRITE = 'X' (cutover, off during the parallel run).
 dict(name='TripVehicle', set='TripVehicleSet', create=True, props=[
  ('Sin','sin',S,50,True,'c'),('ShipmentId','shipmentid',S,50,False,'c'),('Werks','werks',S,4,False,'c'),('VehicleNo','vehicleno',S,15,False,'c'),
  ('Delivery','delivery',S,4,False,'c'),('VehExit','vehexit',S,1,False,'c'),('Invoices','invoices',S,1000,False,'c'),
  ('Count','count',S,4,False,'c'),('Target','target',S,20,False,'c'),('Ok','ok',S,1,False,'c'),('Message','message',S,255,False,'c')]),
 # Parallel run: every billing document on a Trip Trail or an Instavans vehicle in the last Days days (default 30) and whether both agree.
 dict(name='ParallelCheck', set='ParallelCheckSet', create=False, props=[
  ('Vbeln','vbeln',S,10,True,'c'),('Werks','werks',S,4,False,'c'),('Days','days',S,3,False,'c'),
  ('TtSin','ttsin',S,50,False,'c'),('TtVehicle','ttvehicle',S,15,False,'c'),('TtOn','tton',DT,0,False,'d'),
  ('InstaSin','instasin',S,50,False,'c'),('InstaVehicle','instavehicle',S,15,False,'c'),('InstaOn','instaon',DT,0,False,'d'),('Status','status',S,12,False,'c')]),
]
ASSOC = []
ACT = []
