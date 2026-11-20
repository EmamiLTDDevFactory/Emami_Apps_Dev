import json,re,sys
pairs=json.load(open('pairs.json'))
skip=set(json.load(open('skip_fields.json'))) if len(sys.argv)>1 else set()   # "struct.field" that do not exist
loc={'bapimara':'ms_mara_b','bapimarc':'ms_marc_b','bapimard':'ms_mard_b','bapimbew':'ms_mbew_b','bapimlgn':'ms_mlgn_b','bapimlgt':'ms_mlgt_b','bapimvke':'ms_mvke_b','bapimpop':'ms_mpop_b'}
def gen(st,indent='    '):
    out=[]
    for s,f,src,sf,i in pairs:
        if s!=st or f'{s}.{f}' in skip: continue
        out.append(f"{indent}{loc[st]}-{f} = ls_{src}-{sf}.")
    return '\n'.join(out)
marm=[(f,src,sf) for s,f,src,sf,i in pairs if s=='bapimarm' and f'{s}.{f}' not in skip]
marm_lines='\n'.join(f"      ls_marm_b-{f} = {'ls_marm_st' if src=='marm_st' else 'ls_'+src}-{sf}." for f,src,sf in marm)
tpl=open('poster.tpl.abap').read()
tpl=tpl.replace('%%MARA%%',gen('bapimara')).replace('%%MARC%%',gen('bapimarc')).replace('%%MARD%%',gen('bapimard')).replace('%%MBEW%%',gen('bapimbew'))
tpl=tpl.replace('%%MLGN%%',gen('bapimlgn')).replace('%%MLGT%%',gen('bapimlgt')).replace('%%MVKE%%',gen('bapimvke')).replace('%%MPOP%%',gen('bapimpop')).replace('%%MARM%%',marm_lines)
open('sap/mm/poster.generated.abap','w').write(tpl); print(len(tpl.splitlines()),'lines')
