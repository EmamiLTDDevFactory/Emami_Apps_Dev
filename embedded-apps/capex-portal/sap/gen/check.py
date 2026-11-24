import subprocess,re,sys,html
H='https://10.17.10.13:4440/sap/bc/adt'; U='IT_FCOMMON:<password>'; CJ='eds/cj4'
hdr=subprocess.run(['curl','-sk','-u',U,'-c',CJ,'-D','-','-o','/dev/null','-H','x-csrf-token: Fetch',H+'/discovery?sap-client=900'],capture_output=True,text=True).stdout
tok=re.search(r'(?im)^x-csrf-token:\s*(\S+)',hdr).group(1)
for n in sys.argv[1:]:
    body=f'<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core"><chkrun:checkObject adtcore:uri="/sap/bc/adt/oo/classes/{n}" chkrun:version="inactive"/></chkrun:checkObjectList>'
    r=subprocess.run(['curl','-sk','-u',U,'-b',CJ,'-X','POST','-H','x-csrf-token: '+tok,'-H','Content-Type: application/vnd.sap.adt.checkobjects+xml','-H','Accept: application/vnd.sap.adt.checkmessages+xml','--data-binary',body,H+'/checkruns?reporters=abapCheckRun&sap-client=900'],capture_output=True,text=True).stdout
    msgs=re.findall(r'<chkrun:checkMessage ([^>]*)>',r)
    errs=[m for m in msgs if 'type="E"' in m]
    print(n,'messages',len(msgs),'errors',len(errs))
    for m in errs[:6]:
        print('   ',html.unescape(re.sub(r'\s+',' ',m))[:330])
