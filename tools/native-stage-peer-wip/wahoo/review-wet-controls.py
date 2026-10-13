# Previously executed bounded wet-control reader; private receipts remain local.
from pathlib import Path
import os,json,hashlib
p=Path(os.environ['NATIVE_PEER_WET_RECEIPT']);x=json.loads(p.read_text());rows=[]
for q in x['cases']:
 kid=[v for v in q['observations'] if v['form']=='kid' and not v['submerged']];sq=[v for v in q['observations'] if v['form']=='squid' and v['submerged']]
 rows.append({'renderHz':q['renderHz'],'physicsIntervals':q['physicsIntervals'],'kid':kid,'wetSquid':sq,'wetRecoveryDeltas':q['wetRecoveryDeltas'],'actors':q['actors'],'bots':q['bots'],'gearAP':q['gearAP']})
y={'status':'Bounded independent receipt reader; does not substitute for final named review.','receipt':str(p),'receiptSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'exit':int(Path(os.environ['NATIVE_PEER_WET_EXIT']).read_text()),'contentHash':x['contentHash'],'inputHash':x['inputHash'],'errors':x['errors'],'rows':rows,'scope':'Actual fixed-Game/Shooter naturally prepares low ink and own Floor00 in the owner controlled source setup. Own-painted kid and actually submerged squid remain separate observations. No postsetup pose/velocity/ink/paint writes in the observed run.'}
out=Path(os.environ['NATIVE_PEER_WET_OUTPUT']);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(y,ensure_ascii=False,indent=2)+'\n');print({'path':str(out),'cases':len(rows),'exit':y['exit']})
