// Developer-only helpers evaluated in the installed extension's panel page.
// They use its actual controls and runtime; no editor adapter is injected.
(async()=>{
 const original=window.__qaOriginal;
 if(!original)throw new Error('검수 기준 설정이 없습니다.');
 const state=window.__fullFeatureQA?.state??window.__qaSaved??{version:chrome.runtime.getManifest().version,title:'글부기 전체 기능 검수 2026-10-13',startedAt:new Date().toISOString(),writer:original.writer,windowId:original.windowId,originalDatabase:original.database,results:[],shortcuts:[]};
 state.initialVersion??=state.version;state.version=chrome.runtime.getManifest().version;state.originalDatabase=original.database;state.writer=original.writer;state.windowId=original.windowId;
 const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 state.databaseBeforeHash=await digest(state.originalDatabase);
 const wait=async(condition,timeout=10000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await condition();if(value)return value;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('검수 조건 대기 시간이 지났습니다.');};
 const activate=()=>chrome.tabs.update(state.writer,{active:true});
 const read=async()=>{await activate();const response=await chrome.runtime.sendMessage({type:'EDITOR_REQUEST',request:{type:'snapshot'},windowId:state.windowId});if(!response?.ok)throw new Error(response?.error??'편집기 응답이 없습니다.');if(response.snapshot.title!==state.title)throw new Error('전용 검수 글이 아닙니다.');return response.snapshot;};
 const database=async()=>(await chrome.storage.local.get('naver-blog-helper:v1'))['naver-blog-helper:v1'];
 const exact=(label,root=document)=>{const matches=[...root.querySelectorAll('button')].filter(button=>[button.textContent.trim(),button.getAttribute('aria-label'),button.querySelector('.preset-name')?.textContent.trim()].includes(label));if(matches.length!==1)throw new Error('버튼이 하나가 아닙니다: '+label+' ('+matches.length+')');return matches[0];};
 const button=async(label,root=document)=>{let element;await wait(()=>{try{element=exact(label,root);return !element.disabled;}catch{return false;}},3000);element.click();await new Promise(resolve=>setTimeout(resolve,0));};
 const set=(selector,value)=>{const element=document.querySelector(selector);if(!element)throw new Error('입력을 찾지 못했습니다: '+selector);const proto=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};
 const refresh=async()=>{await activate();if(document.querySelector('[aria-label="사진 목록 새로고침"]'))document.querySelector('[aria-label="사진 목록 새로고침"]').click();else{const snapshot=await read();chrome.runtime.sendMessage({type:'PANEL_REFRESH'}).catch(()=>{});return snapshot;}await new Promise(resolve=>setTimeout(resolve,100));return read();};
 const action=async(name,label,{feature='편집',root=document,timeout=12000}={})=>{
  await activate();const before=await read();document.querySelector('[aria-label="알림 닫기"]')?.click();await button(label,root);
  let notice;try{notice=await wait(()=>document.querySelector('.toast'),timeout);}catch(error){const after=await read();state.results.push({name,feature,entryPoint:'설치된 패널 버튼',before,after,pass:false,error:error.message});throw error;}
  const after=await read(),result={name,feature,version:state.version,entryPoint:'설치된 패널 버튼',before,after,notice:notice.querySelector('span')?.textContent??notice.textContent,pass:!notice.classList.contains('error')};state.results.push(result);return result;
 };
 const undo=async(name,expected)=>{const result=await action(name,'되돌리기',{feature:'되돌리기'});result.expectedRevision=expected;result.pass=result.pass&&result.after.revision===expected;if(!result.pass)throw new Error('정확한 복원 실패: '+name+' ('+result.notice+')');return result;};
 const tab=async label=>{await activate();await button(label,document.querySelector('.tabbar'));await new Promise(resolve=>setTimeout(resolve,80));};
 const flush=async()=>{const current=await database();state.databaseAfterHash=await digest(current);state.databaseUnchanged=state.databaseAfterHash===state.databaseBeforeHash;return {...state,originalDatabase:undefined};};
 const start=(name,label,options)=>{
  if(window.__qaPending&&!window.__qaPending.finished)throw new Error('진행 중인 검수가 있습니다.');
  const job=window.__qaPending={name,finished:false};
  action(name,label,options).then(result=>{job.result=result;job.finished=true;},error=>{job.error=error.message;job.finished=true;});
  return {name,started:true};
 };
 chrome.runtime.onMessage.addListener(message=>{if(message.type==='SHORTCUT_RESULT')state.shortcuts.push({at:new Date().toISOString(),response:message.response});});
 window.__fullFeatureQA={state,wait,activate,read,database,digest,button,exact,set,refresh,action,undo,tab,flush,start};
 return {version:state.version,databaseHash:state.databaseBeforeHash,writer:state.writer};
})()
