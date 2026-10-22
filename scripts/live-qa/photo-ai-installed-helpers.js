// Evaluate only in the installed extension's sidepanel.html, after setting
// __installedAiConfig to the dedicated writer tab/window. No adapter injection.
(()=>{
 const {writer,windowId,title}=window.__installedAiConfig;
 const q=window.__installedAiQA={writer,windowId,title,results:[]};
 q.wait=async(fn,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('검수 대기 시간 초과');};
 q.read=async()=>{
  await chrome.tabs.update(writer,{active:true});
  const response=await chrome.runtime.sendMessage({type:'EDITOR_REQUEST',request:{type:'snapshot'},windowId});
  if(!response.ok)throw Error(response.error);
  if(response.snapshot.title!==title)throw Error('전용 검수 문서가 아닙니다.');
  return response.snapshot;
 };
 q.content=s=>{const blocks=structuredClone(s.blocks);for(const block of blocks)for(const item of block.photo?.items??[])delete item.aiMarked;return JSON.stringify({title:s.title,blocks});};
 q.status=s=>s.blocks.filter(block=>block.photo).flatMap(block=>block.photo.items??[]).map(item=>item.aiMarked);
 q.action=async(name,selector)=>{
  const before=await q.read();
  document.querySelector('[aria-label="알림 닫기"]')?.click();
  document.querySelector('[aria-label="사진 목록 새로고침"]').click();
  const states=q.status(before),expectedCount=states.filter(Boolean).length+' / '+states.length+'장 ON';
  await q.wait(()=>{const button=document.querySelector(selector);return button&&!button.disabled&&document.querySelector('.photo-ai-controls [role="status"]').textContent===expectedCount;});
  q.pending={name,before};document.querySelector(selector).click();
  await q.wait(()=>{const toast=document.querySelector('.toast');return toast&&(toast.classList.contains('error')||!document.querySelector('.photo-ai-controls button').disabled);});
  const after=await q.read(),toast=document.querySelector('.toast');
  const result={name,before,after,notice:toast?.textContent,error:toast?.classList.contains('error')??true,preserved:q.content(before)===q.content(after),beforeStates:q.status(before),afterStates:q.status(after)};
  q.results.push(result);q.pending=null;
  return {name,notice:result.notice,error:result.error,preserved:result.preserved,before:result.beforeStates,after:result.afterStates,canUndo:after.canUndo,issue:after.issue};
 };
 return {version:chrome.runtime.getManifest().version};
})()
