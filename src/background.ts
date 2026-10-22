import {prepareEditorRecovery,reloadSavedEditor} from './platform/editor-recovery';
import { loadDatabase, commitDatabaseDiff } from './platform/storage';
import { canonicalPost, validatePost } from './core/security';
import type { EditorRequest, EditorResponse } from './core/types';
import { normalizeBlogSearchRequest } from './core/blog-search';
import { fetchBlogSearchHtml } from './platform/blog-search-fetch';
import {supportsPhotoAi,PHOTO_AI_RECONNECT,supportsPublishTime,PUBLISH_TIME_RECONNECT,isUnsupportedEditorRequest} from './core/editor-capabilities';
type Frame={id:number;editable:boolean};
let registrations:Promise<void>=Promise.resolve();
async function activeTab(windowId?:number){const [tab]=await chrome.tabs.query({active:true,...(Number.isInteger(windowId)?{windowId}:{currentWindow:true})});if(!tab?.id||!tab.url||new URL(tab.url).hostname!=='blog.naver.com')throw new Error('PC 네이버 블로그 글쓰기 탭을 열어 주세요.');return tab;}
const uncertainKey=(tabId:number)=>'uncertain-editor:'+tabId;
async function uncertainSnapshot(tabId:number,response:EditorResponse):Promise<EditorResponse>{
 if(!response.ok||!response.snapshot?.editable)return response;
 const key=uncertainKey(tabId),saved=(await chrome.storage.session.get(key))[key] as {sessionId:string;error:string}|undefined;
 if(!saved?.sessionId)return response;
 if(saved.sessionId!==response.snapshot.sessionId){await chrome.storage.session.remove(key);return response;}
 return {...response,snapshot:{...response.snapshot,issue:response.snapshot.issue??saved.error,canUndo:false}};
}
async function sendToEditor(request:EditorRequest,windowId?:number):Promise<EditorResponse>{
 const tab=await activeTab(windowId);const key='frames:'+tab.id;
 await registrations;
 const frames=((await chrome.storage.session.get(key))[key]??[]) as Frame[];
 const mutation=!['snapshot','focus'].includes(request.type);
 const candidates=[...frames].reverse().sort((a,b)=>Number(b.editable)-Number(a.editable));
 let failure='편집기와 연결되지 않았어요. 네이버 글쓰기 탭을 새로고침해 주세요.';
 for(const frame of candidates){
  let dispatched=false,sessionId:string|undefined;
  try{
   // Reloading a draft replaces its frame. A read-only probe can skip a stale
   // registration without risking a duplicate edit in another frame.
   if(mutation){const probe=await chrome.tabs.sendMessage(tab.id!,{type:'EDITOR',request:{type:'snapshot'}},{frameId:frame.id});if(!probe?.ok||!probe.snapshot?.editable)continue;sessionId=probe.snapshot.sessionId;const guarded=await uncertainSnapshot(tab.id!,probe);if(guarded.ok&&guarded.snapshot.issue)return {ok:false,error:guarded.snapshot.issue,recoveryRequired:true};if(request.type==='photo-ai-on'&&!supportsPhotoAi(probe.snapshot)){failure=PHOTO_AI_RECONNECT;continue;}if(request.type==='publish-time'&&!supportsPublishTime(probe.snapshot)){failure=PUBLISH_TIME_RECONNECT;continue;}}
   dispatched=mutation;
   const response=await chrome.tabs.sendMessage(tab.id!,{type:'EDITOR',request},{frameId:frame.id});if(response?.ok)return uncertainSnapshot(tab.id!,response);if(response?.error){failure=request.type==='photo-ai-on'&&isUnsupportedEditorRequest(response.error)?PHOTO_AI_RECONNECT:request.type==='publish-time'&&isUnsupportedEditorRequest(response.error)?PUBLISH_TIME_RECONNECT:response.error;if(mutation)return {...response,error:failure};}
   if(mutation){const error='편집기 응답을 확인하지 못했어요. 복구 안내에서 본문을 확인하고 임시저장해 주세요.';if(sessionId)await chrome.storage.session.set({[uncertainKey(tab.id!)]:{sessionId,error}});return {ok:false,error,recoveryRequired:true};}
  }catch{if(dispatched){const error='작업 중 연결이 끊겼어요. 복구 안내에서 본문을 확인하고 임시저장해 주세요.';if(sessionId)try{await chrome.storage.session.set({[uncertainKey(tab.id!)]:{sessionId,error}});}catch{}return {ok:false,error,recoveryRequired:true};}}
 }
 if(!mutation&&!candidates.length)try{return await uncertainSnapshot(tab.id!,await chrome.tabs.sendMessage(tab.id!,{type:'EDITOR',request}));}catch{}
 return {ok:false,error:failure};
}
async function readForRecovery(tabId:number){
 await registrations;
 const frames=((await chrome.storage.session.get('frames:'+tabId))['frames:'+tabId]??[]) as Frame[];
 for(const frame of [...frames].reverse().filter(frame=>frame.editable))try{const result=await chrome.tabs.sendMessage(tabId,{type:'EDITOR',request:{type:'snapshot'}},{frameId:frame.id});if(result?.ok&&result.snapshot?.editable)return result.snapshot;}catch{}
 return null;
}
chrome.runtime.onInstalled.addListener(()=>{void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});});
void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
chrome.tabs.onRemoved.addListener((id,info)=>{void chrome.storage.session.remove(['frames:'+id,uncertainKey(id)]);const key='recovery:'+info.windowId;void chrome.storage.session.get(key).then(saved=>{const target=saved[key] as {tabId?:number}|undefined;if(target?.tabId===id)return chrome.storage.session.remove(key);}).catch(()=>{});});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(message?.type==='PREPARE_EDITOR_RECOVERY'||message?.type==='RELOAD_SAVED_EDITOR'){
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith('chrome-extension://'+chrome.runtime.id+'/')){sendResponse({ok:false,error:'글부기 패널에서 복구 안내를 열어 주세요.'});return false;}
  void (message.type==='PREPARE_EDITOR_RECOVERY'?prepareEditorRecovery(message.windowId,message.expected,readForRecovery).then(target=>({ok:true,target})):reloadSavedEditor(message.windowId,message.target,message.saved,readForRecovery).then(()=>({ok:true}))).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
 }
 if(message?.type==='STORE_DATABASE_DIFF'&&sender.id===chrome.runtime.id){void commitDatabaseDiff(message.base,message.next).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
 if(message?.type==='REGISTER_FRAME'&&sender.tab?.id!==undefined){
  const key='frames:'+sender.tab.id;
  registrations=registrations.catch(()=>{}).then(async()=>{const raw=await chrome.storage.session.get(key),frames=(raw[key]??[]) as Frame[];await chrome.storage.session.set({[key]:[...frames.filter(f=>f.id!==sender.frameId),{id:sender.frameId??0,editable:!!message.editable}]});sendResponse({ok:true});}).catch(error=>sendResponse({ok:false,error:error.message}));return true;
 }
 if(message?.type==='EDITOR_CHANGED'){void chrome.runtime.sendMessage({type:'PANEL_REFRESH'}).catch(()=>{});return false;}
 if(message?.type==='EDITOR_REQUEST'){void sendToEditor(message.request,message.windowId).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
 if(message?.type==='OPEN_SHORTCUTS'){void chrome.tabs.create({url:'chrome://extensions/shortcuts'}).then(()=>sendResponse({ok:true}));return true;}
 if(message?.type==='OPEN_EXTENSION_MANAGER'){void chrome.tabs.create({url:'chrome://extensions/?id='+chrome.runtime.id}).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
 if(message?.type==='CAPTURE_ACTIVE_POST'){
  void (async()=>{const tab=await activeTab(message.windowId);const key='frames:'+tab.id,frames=((await chrome.storage.session.get(key))[key]??[]) as Frame[];for(const frame of [...frames].sort((a,b)=>a.id===0?1:b.id===0?-1:0)){try{const r=await chrome.tabs.sendMessage(tab.id!,{type:'CAPTURE_POST'},{frameId:frame.id});if(r?.ok){const db=await loadDatabase();return {ok:true,post:validatePost(r.post,db.settings.blogUrl)};}}catch{}}throw new Error('개별 내 글 페이지를 열고 다시 등록해 주세요.');})().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
 }
 if(message?.type==='FETCH_POST'){
  void (async()=>{
   const db=await loadDatabase(),identity=canonicalPost(message.url);if(db.settings.blogUrl!=='https://blog.naver.com/'+identity.blogId)throw new Error('등록한 내 블로그의 URL만 가져올 수 있어요.');
   const response=await fetch(message.url,{credentials:'omit',redirect:'follow'});if(!['blog.naver.com','m.blog.naver.com'].includes(new URL(response.url).hostname)||!response.ok)throw new Error('원문에 접근할 수 없어요. 열린 내 글 등록이나 직접 입력을 이용해 주세요.');
   const length=Number(response.headers.get('content-length')??0);if(length>2*1024*1024)throw new Error('원문 자료가 너무 커요. 직접 입력해 주세요.');const html=await response.text();if(html.length>2*1024*1024)throw new Error('원문 자료가 너무 커요.');
   return {ok:true,html,url:response.url};
  })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
 }
 if(message?.type==='SEARCH_OWN_BLOG'){
  void (async()=>{
   if(sender.id!==chrome.runtime.id)throw new Error('확장 프로그램에서 내 글 검색을 실행해 주세요.');
   const request=normalizeBlogSearchRequest(message),db=await loadDatabase();
   if(request.blogUrl!==db.settings.blogUrl)throw new Error('설정한 내 블로그에서만 검색할 수 있어요. 블로그 주소를 확인해 주세요.');
   return {ok:true,...await fetchBlogSearchHtml(request)};
  })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
 }
 return false;
});
chrome.commands.onCommand.addListener(async command=>{
 if(!/^apply-preset-[1-8]$/.test(command))return;
 const db=await loadDatabase(),id=db.settings.shortcutPresets[command.split('-').at(-1)!],preset=db.presets.find(p=>p.id===id);
 if(!preset)return;try{const response=await sendToEditor({type:'format',preset});await chrome.runtime.sendMessage({type:'SHORTCUT_RESULT',response});}catch{}
});
