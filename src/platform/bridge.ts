import type {RecoveryTarget} from './editor-recovery';
import type {Snapshot} from '../core/types';
import type { EditorRequest, EditorResponse, Post } from '../core/types';
import { isExtension } from './storage';
import { demoEditor } from './demo';
import { canonicalPost, validatePost } from '../core/security';
import { readPostDocument } from '../core/post-document';
import { assertBlogSearchUrl, normalizeBlogSearchRequest, readBlogSearchDocument, type BlogSearchResult } from '../core/blog-search';
import {PHOTO_AI_RECONNECT,PUBLISH_TIME_RECONNECT,isUnsupportedEditorRequest} from '../core/editor-capabilities';
export async function searchOwnBlog(blogUrl:string,query:string,page=1):Promise<BlogSearchResult>{
 const request=normalizeBlogSearchRequest({blogUrl,query,page});
 if(!isExtension())throw new Error('내 글 검색은 설치된 확장 프로그램에서 사용할 수 있어요.');
 const response=await chrome.runtime.sendMessage({type:'SEARCH_OWN_BLOG',...request});
 if(!response?.ok)throw new Error(response?.error??'검색 결과를 가져오지 못했어요. 다시 검색해 주세요.');
 if(typeof response.html!=='string'||typeof response.url!=='string')throw new Error('검색 결과를 확인하지 못했어요. 다시 검색해 주세요.');
 assertBlogSearchUrl(response.url,request);
 return readBlogSearchDocument(new DOMParser().parseFromString(response.html,'text/html'),request);
}
export async function editorRequest(request:EditorRequest):Promise<EditorResponse>{if(!isExtension())return demoEditor.handle(request);try{const windowId=(await chrome.windows.getCurrent()).id;const response:EditorResponse=await chrome.runtime.sendMessage({type:'EDITOR_REQUEST',request,windowId});if(!response)return {ok:false,error:'편집기에 연결되지 않았어요. 네이버 글쓰기 탭을 새로고침해 주세요.'};if(request.type==='photo-ai-on'&&!response.ok&&isUnsupportedEditorRequest(response.error))return {ok:false,error:PHOTO_AI_RECONNECT};if(request.type==='publish-time'&&!response.ok&&isUnsupportedEditorRequest(response.error))return {ok:false,error:PUBLISH_TIME_RECONNECT};return response;}catch{return {ok:false,error:'편집기에 연결되지 않았어요. 네이버 글쓰기 탭을 새로고침해 주세요.'};}}
export async function capturePost(ownBlog:string):Promise<Post>{
 if(!isExtension())throw new Error('열린 내 글 등록은 설치된 확장 프로그램에서 사용할 수 있어요.');
 const windowId=(await chrome.windows.getCurrent()).id;
 const r=await chrome.runtime.sendMessage({type:'CAPTURE_ACTIVE_POST',windowId});if(!r?.ok)throw new Error(r?.error??'열린 내 글을 읽을 수 없어요.');return validatePost(r.post,ownBlog);
}
export async function fetchPost(input:string,ownBlog:string):Promise<Post>{
 const identity=canonicalPost(input);if(!isExtension())throw new Error('네이버 원문 읽기는 설치된 확장 프로그램에서 사용할 수 있어요. 제목과 발췌를 직접 입력해 등록할 수도 있어요.');
 async function read(url:string){const r=await chrome.runtime.sendMessage({type:'FETCH_POST',url});if(!r?.ok)throw new Error(r?.error??'원문에 접근할 수 없어요.');return new DOMParser().parseFromString(r.html,'text/html');}
 let doc=await read(identity.url);
 const iframe=doc.querySelector<HTMLIFrameElement>('iframe#mainFrame');
 if(iframe?.getAttribute('src')){const url=new URL(iframe.getAttribute('src')!,identity.url);const parsed=canonicalPost(url.href);if(parsed.url===identity.url)doc=await read(url.href);}
 return validatePost({...readPostDocument(doc,identity),collectedAt:new Date().toISOString()},ownBlog);
}
export async function openShortcuts(){if(isExtension())await chrome.runtime.sendMessage({type:'OPEN_SHORTCUTS'});else throw new Error('크롬 확장 설치 후 단축키를 지정할 수 있어요.');}
export async function openExtensionManager(){if(!isExtension())throw new Error('설치된 확장 프로그램에서 관리 화면을 열어 주세요.');const response=await chrome.runtime.sendMessage({type:'OPEN_EXTENSION_MANAGER'});if(!response?.ok)throw new Error(response?.error??'확장 관리 화면을 열지 못했어요. chrome://extensions에서 확인해 주세요.');}

export async function prepareRecovery(snapshot:Snapshot|null):Promise<RecoveryTarget>{
 if(!isExtension())throw new Error('설치된 글부기 패널에서 복구를 진행해 주세요.');
 const windowId=(await chrome.windows.getCurrent()).id,expected=snapshot?{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}:undefined;
 const response=await chrome.runtime.sendMessage({type:'PREPARE_EDITOR_RECOVERY',windowId,expected});
 if(!response?.ok||!response.target)throw new Error(response?.error??'복구 기능을 연결하지 못했어요. 아래의 수동 새로고침 안내를 이용해 주세요.');return response.target;
}
export async function reloadAfterSave(target:RecoveryTarget):Promise<void>{
 const windowId=(await chrome.windows.getCurrent()).id;
 const response=await chrome.runtime.sendMessage({type:'RELOAD_SAVED_EDITOR',windowId,target,saved:true});
 if(!response?.ok)throw new Error(response?.error??'새로고침 요청을 확인하지 못했어요. 네이버 화면에서 연결 상태를 확인해 주세요.');
}
