import zipfile,re,sys,html
def read(path):
    z=zipfile.ZipFile(path); ss=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        x=z.read('xl/sharedStrings.xml').decode('utf8')
        ss=[html.unescape(''.join(re.findall(r'<t[^>]*>([^<]*)</t>',si))) for si in re.findall(r'<si>(.*?)</si>',x,flags=re.S)]
    out={}
    wbx=z.read('xl/workbook.xml').decode()
    names=re.findall(r'<sheet [^>]*name="([^"]+)"',wbx)
    for i,n in enumerate(names,1):
        x=z.read(f'xl/worksheets/sheet{i}.xml').decode('utf8'); rows=[]
        for r in re.findall(r'<row[^>]*>(.*?)</row>',x,flags=re.S):
            row={}
            for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)',r,flags=re.S):
                col,attrs,body=m.group(1),m.group(2),m.group(3) or ''
                v=re.search(r'<v>([^<]*)</v>',body); t=re.search(r't="(\w+)"',attrs)
                val=v.group(1) if v else (html.unescape(''.join(re.findall(r'<t[^>]*>([^<]*)</t>',body))) if 'inlineStr' in attrs else '')
                if t and t.group(1)=='s' and v: val=ss[int(val)]
                row[col]=html.unescape(val)
            rows.append(row)
        out[n]=rows
    return out
if __name__=='__main__':
    d=read(sys.argv[1])
    for n,rows in d.items():
        print('SHEET',n,len(rows))
        for r in rows[:int(sys.argv[2]) if len(sys.argv)>2 else 6]: print(r)
