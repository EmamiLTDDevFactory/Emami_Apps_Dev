import subprocess, sys, re, os
H='https://10.17.10.13:4440/sap/bc/adt'; U='IT_FCOMMON:<password>'; TR='EDSK9B0EO6'
CJ='eds/cj2'
def curl(args, data=None):
    cmd=['curl','-sk','-m','120','-u',U,'-b',CJ,'-c',CJ]+args
    r=subprocess.run(cmd,capture_output=True,text=True,input=data)
    return r.stdout
if os.path.exists(CJ): os.remove(CJ)
hdr=subprocess.run(['curl','-sk','-u',U,'-c',CJ,'-D','-','-o','/dev/null','-H','x-csrf-token: Fetch',H+'/discovery?sap-client=900'],capture_output=True,text=True).stdout
tok=re.search(r'(?im)^x-csrf-token:\s*(\S+)',hdr).group(1)
for name in sys.argv[1:]:
    uri=f'{H}/oo/classes/{name}'
    base=['-H','x-csrf-token: '+tok,'-H','X-sap-adt-sessiontype: stateful']
    lock=curl(base+['-X','POST','-H','Accept: application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result',f'{uri}?_action=LOCK&accessMode=MODIFY&sap-client=900'])
    m=re.search(r'<LOCK_HANDLE>([^<]+)</LOCK_HANDLE>',lock)
    if not m: print(name,'LOCK FAIL',lock[:300]); continue
    h=m.group(1)
    src=open(f'new/{name}.abap').read()
    put=curl(base+['-X','PUT','-H','Content-Type: text/plain; charset=utf-8','--data-binary','@-','-w','\nHTTP %{http_code}',f'{uri}/source/main?lockHandle={h}&corrNr={TR}&sap-client=900'],data=src)
    print(name,'PUT',put.strip()[-200:].replace('\n',' '))
    un=curl(base+['-X','POST','-w','HTTP %{http_code}',f'{uri}?_action=UNLOCK&lockHandle={h}&sap-client=900'])
    print(name,'UNLOCK',un[-20:])
