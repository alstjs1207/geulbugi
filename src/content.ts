import { NativeAdapter } from './editor/native-adapter';
import type { EditorRequest } from './core/types';
import { canonicalPost } from './core/security';
import { readPostDocument } from './core/post-document';
const adapter=new NativeAdapter();
let registered=false;
async function announce(){const s=await adapter.snapshot();if(!adapter.reader.getRoot())return;try{await chrome.runtime.sendMessage({type:'REGISTER_FRAME',editable:s.editable,url:location.href});registered=true;}catch{ /* Extension reloaded: page refresh reattaches content script. */ }}
adapter.reader.onChange=()=>{if(!registered){void announce().catch(()=>{});return;}try{void chrome.runtime.sendMessage({type:'EDITOR_CHANGED'}).catch(()=>{});}catch{ /* Old tabs can outlive the reloaded extension context. */ }};
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 if(message?.type==='EDITOR'){
  if(!adapter.reader.getRoot())return false;
  void adapter.handle(message.request as EditorRequest).then(sendResponse).catch(error=>sendResponse({ok:false,error:error instanceof Error?error.message:'편집기 응답을 확인하지 못했어요.'}));return true;
 }
 if(message?.type==='CAPTURE_POST'){
  try{const identity=canonicalPost(location.href);const snapshot=adapter.reader.read();if(snapshot.editable){sendResponse({ok:false,error:'발행된 내 글 페이지를 열어 등록해 주세요.'});return false;}
   sendResponse({ok:true,post:{...readPostDocument(document,identity),collectedAt:new Date().toISOString()}});
  }catch(error){sendResponse({ok:false,error:error instanceof Error?error.message:'개별 내 글 페이지에서 실행해 주세요.'});}return false;
 }
 return false;
});
void announce().catch(()=>{});
