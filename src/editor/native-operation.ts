import type {Snapshot} from '../core/types';
import type {EditorReader} from './reader';

// A dispatched native action may still complete. Never resend or roll it back
// on a timeout without an acknowledgement of its first result.
export class PendingNativeEditError extends Error{}
export async function waitNativeRevision(reader:EditorReader,before:Snapshot,guard:()=>void,message:string,timeout=2000):Promise<void>{
 const deadline=Date.now()+timeout;let revision=before.revision,changedAt=Date.now();
 while(Date.now()<deadline){
  guard();const current=reader.read();
  if(current.sessionId!==before.sessionId||current.documentKey!==before.documentKey)throw new PendingNativeEditError('처리 중 편집 문서가 바뀌었어요. 현재 원고를 확인해 주세요.');
  if(current.revision!==revision){revision=current.revision;changedAt=Date.now();}
  if(revision!==before.revision&&Date.now()-changedAt>=80)return;
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 throw new PendingNativeEditError(message);
}
