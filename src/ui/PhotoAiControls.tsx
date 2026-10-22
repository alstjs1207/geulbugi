import {useRef,useState} from 'react';
import type {EditorRequest,Snapshot} from '../core/types';
import {photoAiStatus} from '../core/photo-ai';
import {PHOTO_AI_RECONNECT,supportsPhotoAi} from '../core/editor-capabilities';

export function PhotoAiControls({snapshot,busy,onApply,onReconnect}:{snapshot:Snapshot|null;busy:boolean;onApply:(request:EditorRequest,success:string)=>Promise<boolean>;onReconnect?:()=>void}){
 const running=useRef(false),[applying,setApplying]=useState(false);
 const status=photoAiStatus(snapshot?.blocks??[]),supported=!!snapshot&&supportsPhotoAi(snapshot);
 const disabled=busy||applying||!snapshot?.editable||!!snapshot.issue||snapshot.uploadBusy||snapshot.mediaPreparing||!supported||!status.total||!!status.unknown;
 async function apply(){
  if(disabled||running.current||!snapshot)return;
  running.current=true;setApplying(true);
  try{await onApply({type:'photo-ai-on',expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}},'사진 '+status.total+'장의 AI 활용 설정을 모두 켰어요.');}
  finally{running.current=false;setApplying(false);}
 }
 return <section className="photo-ai-controls" aria-label="사진 AI 활용 설정">
  <div className="section-title"><h3>AI 활용 설정</h3><span className="tiny-tag" role="status">{status.on} / {status.total}장 ON</span></div>
  <p className="helper">현재 글의 모든 사진에 적용해요. 이미 켜진 사진은 유지하고 꺼진 사진만 켜요.</p>
  <button className="secondary" disabled={disabled} onClick={()=>void apply()}>{applying?'AI 활용 설정 켜는 중…':'AI 활용 설정 일괄 ON'}</button>
  {snapshot&&!supported&&<p className="helper" role="alert">{PHOTO_AI_RECONNECT}{onReconnect&&<button className="text-btn" onClick={onReconnect}>확장 관리 열기</button>}</p>}
  {supported&&status.unknown>0&&<p className="helper" role="alert">{status.unknown}장의 AI 활용 설정을 확인하지 못했어요. 사진 확인이 끝난 뒤에도 같으면 글쓰기 탭을 새로고침해 주세요.</p>}
 </section>;
}
