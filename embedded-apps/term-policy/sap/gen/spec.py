# Single source of truth for the OData model of ZLIFE_INS_SRV: generates the types class and the model provider.
# prop: (EdmName, abap_component, kind, length, key, abap_type)
TYCLASS = 'ZCL_LIFE_INS_TY'
S = 'str'; D = 'dec'; DT = 'date'; I = 'int'
ENT = [
 dict(name='Profile', set='ProfileSet', create=False, props=[
  ('Email','email',S,241,True,'c'),('User','user',S,12,False,'c'),('Role','role',S,10,False,'c'),('EmpId','empid',S,8,False,'c'),
  ('ActiveYear','activeyear',S,4,False,'c')]),
 dict(name='Employee', set='EmployeeSet', create=False, props=[
  ('EmpId','empid',S,8,True,'c'),('Email','email',S,241,True,'c'),('FirstName','firstname',S,40,False,'c'),('LastName','lastname',S,40,False,'c'),
  ('Dob','dob',DT,0,False,'d'),('Age','age',I,0,False,'i'),('Gender','gender',S,10,False,'c'),('CompanyCode','companycode',S,4,False,'c'),
  ('CompanyName','companyname',S,40,False,'c'),('Department','department',S,40,False,'c'),('OrgUnit','orgunit',S,40,False,'c'),
  ('Designation','designation',S,40,False,'c'),('Location','location',S,10,False,'c'),('LocationText','locationtext',S,30,False,'c'),
  ('CompanyMail','companymail',S,241,False,'c'),('LimitText','limittext',S,20,False,'c'),('Year','year',S,4,False,'c')]),
 dict(name='SumOption', set='SumOptionSet', create=False, props=[
  ('Email','email',S,241,True,'c'),('EmpId','empid',S,8,True,'c'),('Slno','slno',S,3,True,'c'),('SumText','sumtext',S,20,False,'c'),
  ('SumAmount','sumamount',D,13,False,'p'),('Premium','premium',D,13,False,'p'),('Gst','gst',D,13,False,'p'),('Total','total',D,13,False,'p')]),
 dict(name='Policy', set='PolicySet', create=True, props=[
  ('Reqno','reqno',S,10,True,'c'),('Email','email',S,241,True,'c'),('Year','year',S,4,False,'c'),('EmpId','empid',S,8,False,'c'),
  ('EmployeeName','employeename',S,80,False,'c'),('Designation','designation',S,40,False,'c'),('OrgUnit','orgunit',S,40,False,'c'),
  ('LocationText','locationtext',S,30,False,'c'),('CompanyMail','companymail',S,241,False,'c'),('PersonalMail','personalmail',S,241,False,'c'),
  ('Contact','contact',S,30,False,'c'),('SumText','sumtext',S,20,False,'c'),('Premium','premium',D,13,False,'p'),('Gst','gst',D,13,False,'p'),
  ('Total','total',D,13,False,'p'),('CreatedBy','createdby',S,12,False,'c'),('ReqDate','reqdate',DT,0,False,'d'),('AllRows','allrows',S,1,False,'c')]),
 dict(name='Nominee', set='NomineeSet', create=False, props=[
  ('Reqno','reqno',S,10,True,'c'),('SlNo','slno',S,2,True,'c'),('Name','name',S,80,False,'c'),('Relation','relation',S,1,False,'c'),
  ('PerShare','pershare',S,3,False,'c')]),
 dict(name='LimitUpload', set='LimitUploadSet', create=True, props=[
  ('Email','email',S,241,True,'c'),('Count','count',I,0,False,'i')]),
 dict(name='LimitRow', set='LimitRowSet', create=False, props=[
  ('Email','email',S,241,True,'c'),('EmpId','empid',S,8,True,'c'),('Limit','limit',S,20,False,'c')]),
 # DELETE / MAIL commands are entity creates: the gateway hub answers every function-import POST with an empty 404 (also for Mediclaim),
 # while entity-create POSTs pass.
 dict(name='Command', set='CommandSet', create=True, props=[
  ('Email','email',S,241,True,'c'),('Action','action',S,10,False,'c'),('Reqnos','reqnos',S,1000,False,'c'),
  ('Ok','ok',S,1,False,'c'),('Message','message',S,255,False,'c')]),
]
# (assoc name, left type, right type, left set, right set, nav prop, nav field, ref constraint props)
ASSOC = [
 ('Policy_Nominees','Policy','Nominee','PolicySet','NomineeSet','Nominees','NOMINEES',['Reqno']),
 ('LimitUpload_Rows','LimitUpload','LimitRow','LimitUploadSet','LimitRowSet','Rows','ROWS',['Email']),
]
# function imports: name, return entity type, return set, [(param, field, kind, len)]
ACT = []
