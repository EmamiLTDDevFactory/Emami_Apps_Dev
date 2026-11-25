import subprocess,re,sys,html
H='https://10.17.10.13:4440/sap/bc/adt'; U='IT_FCOMMON:<password>'; CJ='eds/cj5'
hdr=subprocess.run(['curl','-sk','-u',U,'-c',CJ,'-D','-','-o','/dev/null','-H','x-csrf-token: Fetch',H+'/discovery?sap-client=900'],capture_output=True,text=True).stdout
tok=re.search(r'(?im)^x-csrf-token:\s*(\S+)',hdr).group(1)
refs=''.join(f'<adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/{n}" adtcore:name="{n.upper()}"/>' for n in sys.argv[1:])
body=f'<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">{refs}</adtcore:objectReferences>'
def post(q,b):
    return subprocess.run(['curl','-sk','-u',U,'-b',CJ,'-X','POST','-H','x-csrf-token: '+tok,'-H','Content-Type: application/xml','-H','Accept: application/xml','--data-binary',b,H+'/activation?'+q+'&sap-client=900'],capture_output=True,text=True).stdout
r1=post('method=activate&preauditRequested=true',body)
print('step1',len(r1),re.sub(r'\s+',' ',r1)[:300])
r2=post('method=activate&preauditRequested=false',body)
print('step2',re.sub(r'\s+',' ',html.unescape(r2))[:1200])
