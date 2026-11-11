import type {Snapshot} from '../core/types';
import type {EditorReader} from './reader';

// A dispatched native action may still complete. Never resend or roll it back
// on a timeout without an acknowledgement of its first result.
export class PendingNativeEditError extends Error{}
export async function waitNativeRevision(reader:EditorReader,before:Snapshot,guard:(current?:Snapshot)=>void,message:string,timeout=2000,wake?:AbortSignal):Promise<void>{
 const deadline=Date.now()+timeout;let revision=before.revision,changedAt=Date.now();
 while(Date.now()<deadline){
  const current=reader.read();guard(current);
  if(current.sessionId!==before.sessionId||current.documentKey!==before.documentKey)throw new PendingNativeEditError('처리 중 편집 문서가 바뀌었어요. 현재 원고를 확인해 주세요.');
  if(current.revision!==revision){revision=current.revision;changedAt=Date.now();}
  if(revision!==before.revision&&Date.now()-changedAt>=80)return;
  await new Promise<void>(resolve=>{
   if(wake?.aborted){resolve();return;}
   const finish=()=>{clearTimeout(timer);wake?.removeEventListener('abort',finish);resolve();};
   const timer=setTimeout(finish,40);wake?.addEventListener('abort',finish,{once:true});
  });
 }
 throw new PendingNativeEditError(message);
}
