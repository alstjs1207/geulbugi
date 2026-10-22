import {useEffect,useRef,useState} from 'react';
import type {Snapshot} from '../core/types';
import type {RecoveryTarget} from '../platform/editor-recovery';
import {prepareRecovery,reloadAfterSave} from '../platform/bridge';
import {Busy,Modal,Notice} from './components';
export function RecoveryBanner({issue,connecting,busy,onCheck,onGuide}:{issue?:string;connecting:boolean;busy:boolean;onCheck:()=>void;onGuide:()=>void}){
 return <section className="recovery-banner" aria-label="편집기 연결과 복구">
  <strong>{issue?'본문 확인이 필요해요':connecting?'글쓰기에 연결하고 있어요':'글쓰기 화면에 연결해 주세요'}</strong>
  <p>{issue?'작업 결과를 확인하지 못해 추가 편집을 잠시 멈췄어요.':'네이버 PC 글쓰기 탭을 선택한 뒤 연결을 다시 확인해 주세요.'}</p>
  <div><button className="secondary small" disabled={busy||connecting} onClick={onCheck}>연결 다시 확인</button><button className="text-btn" disabled={busy} onClick={onGuide}>복구 안내</button></div>
 </section>;
}
export function EditorRecoveryDialog({snapshot,onClose,onReload,onCheck}:{snapshot:Snapshot|null;onClose:()=>void;onReload:()=>void;onCheck:()=>Promise<void>}){
 const [target,setTarget]=useState<RecoveryTarget|null>(null),[checking,setChecking]=useState(false),[reloading,setReloading]=useState(false),[error,setError]=useState('');
 const serial=useRef(0),active=useRef(false),key=snapshot?[snapshot.sessionId,snapshot.documentKey,snapshot.revision].join(':'):'';
 useEffect(()=>{serial.current++;setTarget(null);setChecking(false);},[key]);
 useEffect(()=>()=>{serial.current++;},[]);
 async function confirm(checked:boolean){
  const id=++serial.current;setTarget(null);setError('');if(!checked){setChecking(false);return;}
  setChecking(true);
  try{const result=await prepareRecovery(snapshot);if(id===serial.current)setTarget(result);}catch(e){if(id===serial.current){setError(e instanceof Error?e.message:String(e));void onCheck();}}finally{if(id===serial.current)setChecking(false);}
 }
 async function reload(){
  if(!target||active.current)return;active.current=true;setReloading(true);setError('');
  try{await reloadAfterSave(target);onReload();}catch(e){setTarget(null);setError(e instanceof Error?e.message:String(e));void onCheck();}finally{active.current=false;setReloading(false);}
 }
 return <Modal title="글쓰기 복구 안내" onClose={()=>{if(!reloading)onClose();}}>
  <div className="dialog-body recovery-body">
   <p>글부기가 작업 결과를 확인하지 못했을 때는 현재 글을 저장한 뒤 다시 연결해요.</p>
   <ol><li><b>네이버에서 본문 확인</b><p>마지막 작업이 반영됐는지 글·사진·링크를 확인해 주세요. 이미 반영됐다면 같은 작업을 반복하지 마세요.</p></li><li><b>네이버 상단의 ‘저장’ 누르기</b><p>오른쪽 위 ‘저장’은 임시저장 기능이에요. 업로드가 끝난 뒤 누르고 저장 완료 안내를 확인해 주세요.</p></li><li><b>아래에서 저장 확인 후 새로고침</b><p>현재 글쓰기 탭을 새로고침하고 글부기를 다시 연결해요. 저장한 초안이 바로 보이지 않으면 네이버의 임시저장 목록에서 열어 주세요.</p></li></ol>
   {snapshot?.title&&<p className="recovery-document">확인할 글: <b>{snapshot.title}</b></p>}
   <label className="recovery-confirm"><input type="checkbox" checked={!!target} disabled={checking||reloading} onChange={e=>void confirm(e.target.checked)}/>본문을 확인했고, 네이버 임시저장 완료 안내를 확인했어요.</label>
   {checking&&<Busy label="현재 글쓰기 탭을 확인하고 있어요."/>}
   {target&&<p className="helper">새로고침할 글: {target.title}</p>}
   {error&&<div role="alert"><Notice tone="warning">{error}</Notice></div>}
   {snapshot?.issue&&<details><summary>작업 실패 상세</summary><p>{snapshot.issue}</p></details>}
   <p className="helper">저장 후 글을 더 수정했다면 다시 임시저장해 주세요. 이전 작업의 글부기 되돌리기 기록은 새로 연결하면 초기화돼요.</p>
   <details><summary>버튼으로 새로고침할 수 없나요?</summary><p>네이버에서 임시저장 완료를 확인한 뒤 글쓰기 탭의 브라우저 새로고침을 눌러 주세요. 업데이트 안내가 있다면 확장 관리에서 글부기도 새로고침한 뒤 진행하세요.</p></details>
  </div>
  <footer className="modal-footer"><button className="secondary" disabled={reloading} onClick={onClose}>돌아가기</button><button className="primary" disabled={!target||checking||reloading} onClick={()=>void reload()}>{reloading?<Busy label="다시 연결 중"/>:'저장한 글 새로고침'}</button></footer>
 </Modal>;
}
