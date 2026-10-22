import type {Snapshot} from '../core/types';
export type RecoveryTarget={token:string;windowId:number;title:string};
export type RecoveryExpected=Pick<Snapshot,'sessionId'|'documentKey'|'revision'>;
type StoredTarget=Omit<RecoveryTarget,'title'>&{tabId:number;url:string;expected:RecoveryExpected|null;expiresAt:number};
type ReadSnapshot=(tabId:number)=>Promise<Snapshot|null>;
const pending=new Set<string>();
const identity=(s:RecoveryExpected)=>({sessionId:s.sessionId,documentKey:s.documentKey,revision:s.revision});
const matches=(a:RecoveryExpected,b:RecoveryExpected)=>a.sessionId===b.sessionId&&a.documentKey===b.documentKey&&a.revision===b.revision;
function writingUrl(input:string){try{const u=new URL(input);return u.protocol==='https:'&&u.hostname==='blog.naver.com'&&(/\/(?:PostWriteForm|PostUpdateForm)\.naver$/i.test(u.pathname)||u.searchParams.get('Redirect')?.toLowerCase()==='write');}catch{return false;}}
async function currentTab(windowId:number){
 if(!Number.isInteger(windowId))throw new Error('글쓰기 창을 다시 선택해 주세요.');
 const [tab]=await chrome.tabs.query({active:true,windowId});
 if(!tab?.id||!tab.url||tab.pendingUrl||new URL(tab.url).hostname!=='blog.naver.com')throw new Error('복구할 네이버 글쓰기 탭을 선택한 뒤 다시 진행해 주세요.');
 return tab;
}
function settled(snapshot:Snapshot|null){if(snapshot?.uploadBusy||snapshot?.uploadPending||snapshot?.mediaPreparing)throw new Error('사진 확인이나 업로드가 진행 중이에요. 끝난 뒤 임시저장하고 다시 확인해 주세요.');}
export async function prepareEditorRecovery(windowId:number,expected:RecoveryExpected|undefined,read:ReadSnapshot):Promise<RecoveryTarget>{
 const tab=await currentTab(windowId),snapshot=await read(tab.id!);settled(snapshot);
 if(expected&&(!snapshot||!matches(snapshot,expected)))throw new Error('본문이나 글쓰기 탭이 바뀌었어요. 현재 본문을 다시 확인하고 임시저장해 주세요.');
 if(!snapshot?.editable&&!writingUrl(tab.url!))throw new Error('네이버 PC 글쓰기 화면에서만 복구할 수 있어요.');
 const token=crypto.randomUUID(),title=snapshot?.title||tab.title||'네이버 글쓰기',target:StoredTarget={token,windowId,tabId:tab.id!,url:tab.url!,expected:snapshot?.editable?identity(snapshot):null,expiresAt:Date.now()+5*60_000};
 await chrome.storage.session.set({['recovery:'+windowId]:target});
 return {token,windowId,title};
}
export async function reloadSavedEditor(windowId:number,target:RecoveryTarget,saved:boolean,read:ReadSnapshot):Promise<void>{
 if(saved!==true||!target||target.windowId!==windowId||typeof target.token!=='string')throw new Error('본문을 확인하고 네이버 임시저장 완료를 확인해 주세요.');
 if(pending.has(target.token))throw new Error('글쓰기를 다시 연결하고 있어요. 잠시 기다려 주세요.');
 pending.add(target.token);
 try{
  const key='recovery:'+windowId,stored=(await chrome.storage.session.get(key))[key] as StoredTarget|undefined;
  if(!stored||stored.token!==target.token||stored.expiresAt<Date.now())throw new Error('저장 확인이 만료됐어요. 임시저장 완료를 다시 확인해 주세요.');
  const tab=await currentTab(windowId);
  if(tab.id!==stored.tabId||tab.url!==stored.url)throw new Error('다른 탭이 선택되어 있어요. 저장한 글쓰기 탭으로 돌아가 다시 확인해 주세요.');
  const snapshot=await read(tab.id!);settled(snapshot);
  if(stored.expected?(!snapshot||!matches(snapshot,stored.expected)):!!snapshot?.editable)throw new Error('저장 확인 후 본문 상태가 바뀌었어요. 다시 임시저장하고 확인해 주세요.');
  if(!stored.expected&&!writingUrl(tab.url!))throw new Error('복구할 글쓰기 화면을 확인하지 못했어요.');
  const latest=await chrome.tabs.get(tab.id!);
  if(latest.url!==stored.url||latest.pendingUrl||!latest.active||latest.windowId!==windowId)throw new Error('글쓰기 화면이 이동 중이에요. 현재 글을 다시 확인해 주세요.');
  await chrome.storage.session.remove(key);
  await chrome.tabs.reload(tab.id!);
 }finally{pending.delete(target.token);}
}
