// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI,PendingNativeImportError} from '../src/editor/public-ui';
import {defaultDatabase} from '../src/core/defaults';
import {loadDatabase,saveDatabase} from '../src/platform/storage';
import {loadCardReferences} from '../src/platform/link-card-cache';
import {NAVER_QUOTE_STYLES} from '../src/core/naver-format-options';
import type {EditorRequest} from '../src/core/types';
let adapters:NativeAdapter[]=[];
beforeEach(async()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog&trackingCode=one',pathname:'/PostWriteForm.naver'});
 document.title='';document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span>테스트 문장입니다.</span></p></div></div></div>';
 await saveDatabase(defaultDatabase());
 vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){document.querySelector<HTMLElement>('p span')!.style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
 vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='';return true;});
});
afterEach(()=>{for(const adapter of adapters)adapter.reader.dispose();adapters=[];vi.restoreAllMocks();vi.unstubAllGlobals();});
function adapter(){const instance=new NativeAdapter();adapters.push(instance);const node=document.querySelector('p span')!.firstChild!,range=document.createRange();range.selectNodeContents(node);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);instance.reader.captureSelection();return instance;}
const preset={id:'bold-test',name:'굵게만',description:'',format:{bold:true}};
const post={blogId:'example_blog',postId:'10001',url:'https://blog.naver.com/example_blog/10001',title:'링크 제목',tags:[],excerpt:'',publishedAt:'',collectedAt:'2026-10-07T00:00:00Z'};
describe('direct editing and exact undo (mocked native UI)',()=>{
 it.each([0,4,-1])('continues inserting cards in order after a native paragraph replacement at offset %s',async offset=>{
  const first=adapter(),source=first.reader.read().blocks[0];if(offset<0)offset=source.text.length;const range=first.reader.rangeAt(source.id,offset);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);first.reader.captureSelection();
  const original=first.reader.read(),history:string[]=[];
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI,url){
   const snapshot=first.reader.read(),selection=snapshot.selection!,block=snapshot.blocks.find(b=>b.id===selection.blockId)!,element=first.reader.elements.get(block.id)!;
   history.push(document.querySelector('.se-main-container')!.innerHTML);
   const tail=element.cloneNode(true) as HTMLElement;tail.querySelector('span')!.textContent=block.text.slice(selection.start);element.querySelector('span')!.textContent=block.text.slice(0,selection.start);
   const card=document.createElement('div');card.id='card-'+history.length;card.className='se-component se-oglink';card.innerHTML='<strong class="se-oglink-title">링크 제목</strong>';element.after(card,tail);
   const root=document.querySelector('.se-main-container')!;root.innerHTML=root.innerHTML;
   const inserted=first.reader.read().blocks.find(b=>b.componentId===card.id)!;first.reader.rememberLinkCard(inserted.id,url);(this as unknown as {didEdit:()=>void}).didEdit();
  });
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector('.se-main-container')!.innerHTML=history.pop()!;return true;});
  for(const postId of ['10001','10002','10003']){
   const result=await first.handle({type:'link',post:{...post,postId,url:'https://blog.naver.com/example_blog/'+postId}});
   expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)return;
   const snapshot=result.snapshot,card=snapshot.blocks.findIndex(b=>b.linkCard?.url.endsWith('/'+postId)),next=snapshot.blocks[card+1];
   expect(snapshot.selection).toMatchObject({blockId:next.id,start:0,end:0,valid:true,collapsed:true});
   expect(next.text).toBe(source.text.slice(offset));expect(snapshot.canUndo).toBe(true);
  }
  const final=first.reader.read();expect(final.blocks.filter(b=>b.linkCard).map(b=>b.linkCard!.url)).toEqual(['10001','10002','10003'].map(id=>'https://blog.naver.com/example_blog/'+id));
  expect(final.blocks.filter(b=>b.kind==='paragraph').map(b=>b.text).join('')).toBe(source.text);
  expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().blocks.filter(b=>b.linkCard)).toHaveLength(2);
  expect(original.blocks[0].text).toBe(source.text);
 });
 it('keeps a verified card and its undo when positioning the next cursor fails',async()=>{
  const first=adapter(),source=first.reader.read().blocks[0];window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(first.reader.rangeAt(source.id,source.text.length));first.reader.captureSelection();
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI,url){
   document.querySelector('p')!.insertAdjacentHTML('afterend','<div id="new-card" class="se-component se-oglink"><strong class="se-oglink-title">링크 제목</strong></div><p class="se-text-paragraph"><span></span></p>');
   first.reader.rememberLinkCard(first.reader.read().blocks.find(b=>b.kind==='link-card')!.id,url);(this as unknown as {didEdit:()=>void}).didEdit();
  });
  const select=first.reader.selectAt.bind(first.reader);vi.spyOn(first.reader,'selectAt').mockImplementation(async(id,offset,guard)=>{if(id===source.id)return select(id,offset,guard);throw new Error('커서 확인 실패');});
  const result=await first.handle({type:'link',post});expect(result).toMatchObject({ok:true,snapshot:{canUndo:true,selection:null}});expect((await first.snapshot()).issue).toBeUndefined();expect(first.reader.read().linkedUrls).toContain(post.url);expect(PublicEditorUI.prototype.undo).not.toHaveBeenCalled();
 });
 it('automatically checks off-screen photos on connect, restores scroll and preserves selected text',async()=>{
  const root=document.querySelector<HTMLElement>('.se-main-container')!;root.scrollTop=125;
  root.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img class="se-image-resource" src="data:image/svg+xml;base64,AA=="><div class="se-caption">사진 캡션</div></div>');
  const photo=root.querySelector<HTMLElement>('.se-image')!,first=adapter(),selection=first.reader.read().selection;
  photo.scrollIntoView=vi.fn(()=>{root.scrollTop=900;photo.querySelector('img')!.src='https://example.test/offscreen.png';});
  const connected=await first.snapshot();expect(connected).toMatchObject({mediaPending:true,mediaPreparing:true});
  await vi.waitFor(async()=>expect((await first.snapshot()).mediaPreparing).toBe(false));
  const ready=await first.snapshot();expect(ready.mediaPreparing).toBe(false);expect(ready.selection).toEqual(selection);expect(ready.selection?.valid).toBe(true);expect(root.scrollTop).toBe(125);
  expect(ready.blocks.find(b=>b.photo)?.photo).toMatchObject({src:'https://example.test/offscreen.png',caption:'사진 캡션'});expect(photo.scrollIntoView).toHaveBeenCalledOnce();
 });
 it('waits for automatic photo preparation before formatting and keeps exact undo',async()=>{
  const root=document.querySelector<HTMLElement>('.se-main-container')!;
  root.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="data:image/svg+xml;base64,AA=="></div>');
  const photo=root.querySelector<HTMLElement>('.se-image')!,first=adapter();
  photo.scrollIntoView=()=>{photo.querySelector('img')!.src='https://example.test/original.png';};
  expect(await first.handle({type:'format',preset})).toMatchObject({ok:true,snapshot:{mediaPending:false,canUndo:true}});
  expect(await first.handle({type:'undo'})).toMatchObject({ok:true});expect(photo.querySelector('img')!.src).toBe('https://example.test/original.png');
 });
 it('shares one scan across refreshes and retries a failure only on explicit request',async()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="data:image/svg+xml;base64,AA=="></div>');
  const first=adapter();let reject!:(reason:Error)=>void;
  const scan=vi.spyOn(first.reader,'loadPendingPhotos').mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
  await Promise.all([first.snapshot(),first.snapshot(),first.snapshot()]);expect(scan).toHaveBeenCalledOnce();
  reject(new Error('연결 실패'));await vi.waitFor(async()=>expect((await first.snapshot()).mediaPreparing).toBe(false));
  expect((await first.snapshot()).mediaIssue).toBe('연결 실패');await first.snapshot();expect(scan).toHaveBeenCalledOnce();
  document.title='사용자가 제목을 고쳤어요';await first.snapshot();expect(scan).toHaveBeenCalledOnce();
  scan.mockResolvedValue();expect(await first.handle({type:'snapshot',retryMedia:true})).toMatchObject({ok:true});await vi.waitFor(()=>expect(scan).toHaveBeenCalledTimes(2));
 });
 it('stops automatic scrolling on trusted user interaction and offers an explicit retry',async()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="data:image/svg+xml;base64,AA=="></div>');
  const first=adapter(),add=vi.spyOn(document,'addEventListener');let signal:AbortSignal|undefined,restore:(()=>boolean)|undefined;
  vi.spyOn(first.reader,'loadPendingPhotos').mockImplementation(async(_timeout,options)=>{signal=options?.signal;restore=options?.restoreScroll;await new Promise<void>((_,reject)=>signal!.addEventListener('abort',()=>reject(new Error('직접 스크롤하여 멈췄어요'))));});
  await first.snapshot();await vi.waitFor(()=>expect(signal).toBeDefined());
  const wheel=add.mock.calls.find(([type])=>type==='wheel')![1] as EventListener;wheel({isTrusted:true,type:'wheel'} as Event);
  await vi.waitFor(async()=>expect((await first.snapshot()).mediaPreparing).toBe(false));expect(signal?.aborted).toBe(true);expect(restore?.()).toBe(false);expect((await first.snapshot()).mediaPending).toBe(true);
 });
 it('does not auto-scroll a viewer or interfere with a running native upload',async()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="data:image/svg+xml;base64,AA=="></div>');
  const first=adapter(),scan=vi.spyOn(first.reader,'loadPendingPhotos');
  vi.stubGlobal('location',{href:'https://blog.naver.com/example_blog/10001',pathname:'/example_blog/10001'});document.querySelector('[contenteditable]')!.removeAttribute('contenteditable');expect((await first.snapshot()).editable).toBe(false);expect(scan).not.toHaveBeenCalled();
  document.querySelector('.se-main-container > div')!.setAttribute('contenteditable','true');document.body.insertAdjacentHTML('beforeend','<div class="se-upload-progress"></div>');expect((await first.snapshot()).uploadBusy).toBe(true);expect(scan).not.toHaveBeenCalled();
 });
 it.each([false,true])('checks actual reloaded photo URLs after a card recreates off-screen images (replacement: %s)',async replaced=>{
  const root=document.querySelector('.se-main-container')!;
  root.insertAdjacentHTML('beforeend','<div id="photo" class="se-component se-image"><img class="se-image-resource" src="https://example.test/original.png"><div class="se-caption">기존 캡션</div></div>');
  const first=adapter(),block=first.reader.read().blocks[0],selection=window.getSelection()!;
  selection.removeAllRanges();selection.addRange(first.reader.rangeAt(block.id,block.text.length));first.reader.captureSelection();
  const before=await first.snapshot(),html=root.innerHTML;
  const lazy=()=>{
   const photo=document.querySelector<HTMLElement>('#photo')!;
   photo.querySelector('img')!.src='data:image/svg+xml;base64,AA==';
   photo.scrollIntoView=vi.fn(()=>{root.scrollTop=250;photo.querySelector('img')!.src=replaced?'https://example.test/replaced.png':'https://example.test/original.png';});
  };
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI,url){
   root.innerHTML=html;root.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div id="card" class="se-component se-oglink"><strong class="se-oglink-title">링크 제목</strong></div>');lazy();
   first.reader.rememberLinkCard(first.reader.read().blocks.find(b=>b.kind==='link-card')!.id,url);(this as unknown as {didEdit:()=>void}).didEdit();
  });
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root.innerHTML=html;lazy();return true;});
  const result=await first.handle({type:'link',post});expect(result.ok,JSON.stringify(result)).toBe(!replaced);expect(root.scrollTop).toBe(0);
  if(replaced){expect(undo).not.toHaveBeenCalled();expect((await first.snapshot()).issue).toContain('링크 삽입');}
  else{expect((await first.snapshot()).canUndo).toBe(true);expect(await first.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});expect(undo).toHaveBeenCalledOnce();expect(root.scrollTop).toBe(0);}
 });
 it('can pass through split image-group history while restoring the exact group after a failed move',async()=>{
  document.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div id="group" class="se-component se-imageGroup se-l-collage"><div class="se-section se-section-imageGroup se-l-collage"><div class="se-module-image"><img class="se-image-resource" src="https://example.test/a.png"><img class="se-image-resource" src="https://example.test/b.png"></div></div></div>');
  const first=adapter(),before=await first.snapshot(),root=document.querySelector('.se-main-container')!,html=root.innerHTML;
  const split=()=>{document.querySelector('.se-imageGroup')?.remove();root.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><div class="se-section se-section-image"><img class="se-image-resource" src="https://example.test/a.png"></div></div><div class="se-component se-image"><div class="se-section se-section-image"><img class="se-image-resource" src="https://example.test/b.png"></div></div>');};
  vi.spyOn(PublicEditorUI.prototype,'movePhoto').mockImplementation(async function(this:PublicEditorUI){split();(this as unknown as {didEdit:()=>void}).didEdit();});
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{if(undo.mock.calls.length===2)root.innerHTML=html;return true;}),redo=vi.spyOn(PublicEditorUI.prototype,'redo');
  const result=await first.handle({type:'photo-move',photoId:before.blocks.find(b=>b.kind==='photo')!.id,targetId:before.blocks[0].id,placement:'before'});
  expect(result).toMatchObject({ok:false,error:expect.stringContaining('작업 전 상태로 복원')});expect(undo).toHaveBeenCalledTimes(2);expect(redo).not.toHaveBeenCalled();expect((await first.snapshot()).revision).toBe(before.revision);expect((await first.snapshot()).issue).toBeUndefined();
 });
 it.each([post.url,'https://m.blog.naver.com/example_blog/10001?trackingCode=test'])('persists an empty-body card URL and keeps undo after a duplicate: %s',async inputUrl=>{
  document.querySelector('p span')!.textContent='';
  const first=new NativeAdapter();adapters.push(first);const block=first.reader.read().blocks[0],selection=window.getSelection()!,range=first.reader.rangeAt(block.id,0);
  selection.removeAllRanges();selection.addRange(range);first.reader.captureSelection();const before=first.reader.read(),html=document.querySelector('.se-main-container')!.innerHTML;
  const insert=vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI,url){
   expect(url).toBe(post.url);const card=document.createElement('div');card.id='SE-11111111-2222-3333-4444-555555555555';card.className='se-component se-oglink';card.innerHTML='<strong class="se-oglink-title"></strong>';
   card.querySelector('strong')!.textContent=post.title;document.querySelector('[contenteditable]')!.append(card);const block=first.reader.read().blocks.find(b=>b.kind==='link-card')!;first.reader.rememberLinkCard(block.id,url);(this as unknown as {didEdit:()=>void}).didEdit();
  });
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector('.se-main-container')!.innerHTML=html;return true;});
  expect(await first.handle({type:'link',post:{...post,url:inputUrl}})).toMatchObject({ok:true});expect((await first.snapshot()).canUndo).toBe(true);expect(first.reader.read().linkedUrls).toContain(post.url);expect(await loadCardReferences()).toEqual([expect.objectContaining({componentId:'SE-11111111-2222-3333-4444-555555555555',url:post.url})]);
  const duplicate=await first.handle({type:'link',post});expect(duplicate.ok).toBe(false);if(!duplicate.ok)expect(duplicate.error).toContain('이미');expect(insert).toHaveBeenCalledOnce();expect((await first.snapshot()).canUndo).toBe(true);
  expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(before.revision);
 });
 it('edits immediately with an empty title and no blog configuration',async()=>{
  const first=adapter(),original=first.reader.read().revision;
  expect((await first.handle({type:'format',preset})).ok).toBe(true);expect((await first.snapshot()).canUndo).toBe(true);
  expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(original);
  expect(await loadDatabase()).toEqual(defaultDatabase());
 });
 it.each(NAVER_QUOTE_STYLES)('applies $name without per-shape activation',async option=>{
  vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI,format){const paragraph=document.querySelector('p')!,component=document.createElement('div');component.className='se-component se-quotation se-l-'+format.quoteStyle;paragraph.replaceWith(component);component.append(paragraph);(this as unknown as {didEdit:()=>void}).didEdit();});
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{const component=document.querySelector('.se-quotation')!;component.replaceWith(...component.childNodes);return true;});
  const first=adapter(),before=first.reader.read().revision,range=first.reader.rangeAt(first.reader.read().blocks[0].id,2);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);first.reader.captureSelection();
  expect(await first.handle({type:'format',preset:{id:'quote',name:'인용구',description:'',format:{paragraphStyle:'quote',quoteStyle:option.value}}})).toMatchObject({ok:true});
  expect(first.reader.read().blocks[0].quoteStyle).toBe(option.value);expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(before);
 });
 it('stops undo before earlier glyph edits when native history normalizes a citation space',async()=>{
  document.querySelector('[contenteditable]')!.innerHTML='<div id="native-quote" class="se-component se-quotation se-l-default"><div class="se-module se-quote"><p class="se-text-paragraph"><span style="font-weight:700;font-style:italic;text-decoration:underline">테스트 문장입니다.</span></p></div><div class="se-module se-cite"><p class="se-text-paragraph"><span>검수\u00a0출처</span></p></div></div>';
  vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){document.querySelector('.se-quotation')!.className='se-component se-quotation se-l-quotation_line';(this as unknown as {didEdit:()=>void}).didEdit();});
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector('.se-quotation')!.className='se-component se-quotation se-l-default';document.querySelector('.se-cite span')!.textContent='검수 출처';if(undo.mock.calls.length>1)document.querySelector<HTMLElement>('.se-quote span')!.style.fontStyle='normal';return true;});
  const first=adapter(),before=first.reader.read();
  expect((await first.handle({type:'format',preset:{id:'shape',name:'모양',description:'',format:{paragraphStyle:'quote',quoteStyle:'quotation_line'}}})).ok).toBe(true);
  expect((await first.handle({type:'undo'})).ok).toBe(true);expect(undo).toHaveBeenCalledTimes(1);expect(first.reader.read().revision).toBe(before.revision);expect(first.reader.read().blocks[0].runs).toEqual(before.blocks[0].runs);
 });
 it('refreshes a stale insertion bookmark before choosing the native link target',async()=>{
  const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/example_blog';await saveDatabase(db);
  const first=adapter(),block=first.reader.read().blocks[0],selection=window.getSelection()!;
  selection.removeAllRanges();selection.addRange(first.reader.rangeAt(block.id,0));first.reader.captureSelection();selection.removeAllRanges();selection.addRange(first.reader.rangeAt(block.id,block.text.length));
  const target=vi.spyOn(first.reader,'selectAt');vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockRejectedValue(new Error('단위 검사 중단'));
  await first.handle({type:'link',post});expect(target).toHaveBeenCalledWith(block.id,block.text.length);expect(document.querySelector('p')!.textContent).toBe(block.text);
 });
 it('preserves preceding undo after a no-op or a failure that edits nothing',async()=>{
  const first=adapter(),snapshot=first.reader.read();expect((await first.handle({type:'format',preset})).ok).toBe(true);first.reader.captureSelection();
  expect(await first.handle({type:'format',preset})).toMatchObject({ok:true,unchanged:true});expect((await first.snapshot()).canUndo).toBe(true);
  vi.spyOn(PublicEditorUI.prototype,'format').mockRejectedValueOnce(new Error('네이버 정렬 옵션을 찾을 수 없어요.'));
  expect((await first.handle({type:'format',preset:{...preset,format:{fontSize:16}}})).ok).toBe(false);expect((await first.snapshot()).canUndo).toBe(true);expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(snapshot.revision);
 });
 it('reports matching alignment without editing',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='center';const first=adapter(),before=first.reader.read().revision;
  expect(await first.handle({type:'format',preset:{...preset,format:{align:'center'}}})).toMatchObject({ok:true,unchanged:true});expect(PublicEditorUI.prototype.format).not.toHaveBeenCalled();expect(first.reader.read().revision).toBe(before);
 });
 it('rejects unsupported colors even when already present in the source',async()=>{
  document.querySelector<HTMLElement>('p span')!.style.color='#1c5cf2';const first=adapter(),before=first.reader.read().revision;
  const result=await first.handle({type:'format',preset:{...preset,format:{color:'#1c5cf2'}}});expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toContain('#1c5cf2');expect(PublicEditorUI.prototype.format).not.toHaveBeenCalled();expect(first.reader.read().revision).toBe(before);
 });
 it('locks an uncertain native confirmation even before its queued insertion changes the document',async()=>{
  const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/example_blog';await saveDatabase(db);
  const first=adapter(),before=first.reader.read().revision,range=first.reader.rangeAt(first.reader.read().blocks[0].id,0);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);first.reader.captureSelection();
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockRejectedValue(new PendingNativeImportError('링크 처리 완료를 확인하지 못했어요.'));
  expect((await first.handle({type:'link',post})).ok).toBe(false);expect(first.reader.read().revision).toBe(before);expect((await first.snapshot()).canUndo).toBe(false);expect((await first.snapshot()).issue).toContain('복구 안내');
  const restart=await first.handle({type:'format',preset});expect(restart.ok).toBe(false);if(!restart.ok)expect(restart.error).toContain('복구 안내');
 });
 it.each([false,true])('never automatically undoes body changes during a failed link request (submitted: %s)',async submitted=>{
  const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/example_blog';await saveDatabase(db);
  const first=adapter(),block=first.reader.read().blocks[0];window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(first.reader.rangeAt(block.id,0));first.reader.captureSelection();
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector('.se-main-container')!.replaceChildren();return true;});
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI){
   document.querySelector('p span')!.textContent='로딩 중 사용자가 추가한 글';if(submitted)(this as unknown as {didEdit:()=>void}).didEdit();
   throw submitted?new PendingNativeImportError('링크 삽입 완료를 확인하지 못했어요.'):new Error('본문이 바뀌어 삽입을 취소했어요.');
  });
  expect((await first.handle({type:'link',post})).ok).toBe(false);expect(undo).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('로딩 중 사용자가 추가한 글');expect((await first.snapshot()).canUndo).toBe(false);
  expect(!!(await first.snapshot()).issue).toBe(submitted);
 });
 it('preserves user input instead of undoing when link postconditions detect an intervening edit',async()=>{
  const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/example_blog';await saveDatabase(db);
  const first=adapter(),block=first.reader.read().blocks[0];window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(first.reader.rangeAt(block.id,0));first.reader.captureSelection();
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockImplementation(async function(this:PublicEditorUI,url){
   document.querySelector('p span')!.textContent+=' 사용자가 추가한 글';const card=document.createElement('div');card.id='SE-11111111-2222-3333-4444-555555555555';card.className='se-component se-oglink';card.innerHTML='<strong class="se-oglink-title">링크 제목</strong>';document.querySelector('[contenteditable]')!.prepend(card);first.reader.rememberLinkCard(first.reader.read().blocks[0].id,url);(this as unknown as {didEdit:()=>void}).didEdit();
  });
  expect((await first.handle({type:'link',post})).ok).toBe(false);expect(PublicEditorUI.prototype.undo).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe(block.text+' 사용자가 추가한 글');expect((await first.snapshot()).canUndo).toBe(false);expect((await first.snapshot()).issue).toContain('링크 삽입');
 });
 it('retains an earlier undo entry when preview loading fails without modifying the body',async()=>{
  const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/example_blog';await saveDatabase(db);
  const first=adapter(),before=first.reader.read().revision;await first.handle({type:'format',preset});const block=first.reader.read().blocks[0];window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(first.reader.rangeAt(block.id,0));first.reader.captureSelection();
  vi.spyOn(PublicEditorUI.prototype,'insertLinkCard').mockRejectedValue(new Error('미리보기를 불러오지 못했어요.'));
  expect((await first.handle({type:'link',post})).ok).toBe(false);expect((await first.snapshot()).canUndo).toBe(true);expect(PublicEditorUI.prototype.undo).not.toHaveBeenCalled();expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(before);
 });
 it('waits for lazy photos before editing',async()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img class="se-image-resource" src="data:image/svg+xml;base64,AA=="></div>');
  const first=adapter(),before=first.reader.read().revision,result=await first.handle({type:'format',preset});expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toContain('사진 다시 확인');expect(first.reader.read().revision).toBe(before);expect(PublicEditorUI.prototype.format).not.toHaveBeenCalled();
 });
 it('allows a reopened document without a saved grant and starts a fresh undo journal',async()=>{
  const first=adapter();expect((await first.handle({type:'format',preset})).ok).toBe(true);const reopened=adapter();expect((await reopened.snapshot()).canUndo).toBe(false);
  vi.spyOn(PublicEditorUI.prototype,'format').mockImplementationOnce(async function(this:PublicEditorUI){document.querySelector<HTMLElement>('p span')!.style.fontSize='16px';(this as unknown as {didEdit:()=>void}).didEdit();});
  expect((await reopened.handle({type:'format',preset:{...preset,format:{fontSize:16}}})).ok).toBe(true);
 });
 it('does not undo over later user edits',async()=>{
  const first=adapter();await first.handle({type:'format',preset});document.querySelector('p span')!.textContent='사용자가 추가로 수정함';expect((await first.handle({type:'undo'})).ok).toBe(false);expect(document.querySelector('p span')!.textContent).toBe('사용자가 추가로 수정함');
 });
 it('continues through invisible history and stops exactly at the baseline',async()=>{
  const first=adapter(),original=first.reader.read().revision;await first.handle({type:'format',preset});
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockResolvedValueOnce(true).mockImplementationOnce(async()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='';return true;});
  expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(original);expect(undo).toHaveBeenCalledTimes(2);
 });
 it('stops after a format undo restores the native caption focus affordance',async()=>{
  document.body.insertAdjacentHTML('beforeend','<style>.se-caption.se-is-focused{background:#f1f1f1}</style>');document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div id="protected-photo" class="se-component se-image"><img class="se-image-resource" src="https://example.test/photo.png"><div class="se-caption"><p class="se-text-paragraph"><span>직전 사용자 캡션</span></p></div></div>');
  const first=adapter(),before=await first.snapshot();await first.handle({type:'format',preset});
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='';document.querySelector('.se-caption')!.classList.add('se-is-focused');return true;});
  expect(await first.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});expect(undo).toHaveBeenCalledOnce();expect(document.querySelector('.se-caption')!.textContent).toBe('직전 사용자 캡션');
 });
 it.each(['caption','body','photo'])('redoes an out-of-range native undo that would lose earlier user %s',async protectedPart=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div id="protected-photo" class="se-component se-image"><img class="se-image-resource" src="https://example.test/photo.png"><div class="se-caption"><p class="se-text-paragraph"><span>직전 사용자 캡션</span></p></div></div>');
  const first=adapter();await first.handle({type:'format',preset});const caption=document.querySelector<HTMLElement>('.se-caption span')!,photo=document.getElementById('protected-photo')!,body=document.querySelector('p span')!;
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementationOnce(async()=>{(body as HTMLElement).style.fontWeight='';caption.style.color='red';return true;}).mockImplementationOnce(async()=>{if(protectedPart==='caption')caption.textContent='';if(protectedPart==='body')body.textContent='';if(protectedPart==='photo')photo.remove();return true;});
  const redo=vi.spyOn(PublicEditorUI.prototype,'redo').mockImplementation(async()=>{caption.textContent='직전 사용자 캡션';body.textContent='테스트 문장입니다.';if(!photo.isConnected)document.querySelector('.se-main-container')!.append(photo);return true;});
  expect((await first.handle({type:'undo'})).ok).toBe(false);expect(undo).toHaveBeenCalledTimes(2);expect(redo).toHaveBeenCalledOnce();expect(caption.textContent).toBe('직전 사용자 캡션');expect(body.textContent).toBe('테스트 문장입니다.');expect(photo.isConnected).toBe(true);expect((await first.snapshot()).issue).toBeTruthy();
 });
 it('blocks edits when consumed undo attempts do not restore the baseline',async()=>{
  const first=adapter();await first.handle({type:'format',preset});const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockResolvedValue(true);expect((await first.handle({type:'undo'})).ok).toBe(false);expect(undo).toHaveBeenCalledTimes(2);expect((await first.snapshot()).issue).toBeTruthy();expect((await first.handle({type:'format',preset})).ok).toBe(false);
 });
 it('rolls back unintended text changes automatically',async()=>{
  const first=adapter(),before=first.reader.read();vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){document.querySelector('p span')!.textContent='원치 않는 변경';(this as unknown as {didEdit:()=>void}).didEdit();});
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector('p span')!.textContent=before.blocks[0].text;return true;});
  const result=await first.handle({type:'format',preset});expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toContain('복원');expect(first.reader.read().revision).toBe(before.revision);
 });
 it('keeps a mutation locked while snapshots and rejected requests run',async()=>{
  const first=adapter();let release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
  vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){started();await pending;document.querySelector<HTMLElement>('p span')!.style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
  const applying=first.handle({type:'format',preset});await entered;
  expect((await first.handle({type:'snapshot'})).ok).toBe(true);
  for(let i=0;i<2;i++){const rejected=await first.handle({type:'format',preset});expect(rejected.ok).toBe(false);if(!rejected.ok)expect(rejected.error).toContain('진행 중');}
  release();expect((await applying).ok).toBe(true);expect((await first.snapshot()).canUndo).toBe(true);
 });
 it('rejects removed legacy requests without editing',async()=>{
  const first=adapter(),before=first.reader.read().revision;expect((await first.handle({type:'verification-start',feature:'format'} as unknown as EditorRequest)).ok).toBe(false);expect(first.reader.read().revision).toBe(before);expect(PublicEditorUI.prototype.format).not.toHaveBeenCalled();
 });
 it('does not require storage writes to apply or undo a format',async()=>{
  const first=adapter(),before=first.reader.read().revision,write=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new DOMException('저장 공간 부족','QuotaExceededError');});
  expect((await first.handle({type:'format',preset})).ok).toBe(true);expect((await first.handle({type:'undo'})).ok).toBe(true);expect(first.reader.read().revision).toBe(before);expect(write).not.toHaveBeenCalled();
 });
});
