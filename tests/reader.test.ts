// @vitest-environment jsdom
import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { EditorReader } from '../src/editor/reader';
import { NativeAdapter } from '../src/editor/native-adapter';
import { PRESETS } from '../src/core/defaults';
let readers:EditorReader[]=[];
beforeEach(()=>{const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key),clear:()=>store.clear()});localStorage.clear();document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div class="se-component"><div contenteditable="true"><p class="se-text-paragraph"><span>문장 </span><b>굵은 글자</b><a href="https://blog.naver.com/example_blog/10001">링크</a></p><p class="se-text-paragraph" data-paragraph-style="heading">소제목</p></div></div><div class="se-component se-quotation"><p class="se-text-paragraph">인용 문장입니다.</p></div><div class="se-component se-table"><p class="se-text-paragraph">표 내용</p></div><div class="se-component se-image"><img src="https://example.test/image.png" alt="사진"/><div class="se-module-image-caption">사진 캡션</div></div></div></div><button id="outside">패널을 눌렀다고 가정</button>';});
afterEach(()=>{for(const reader of readers)reader.dispose();readers=[];vi.unstubAllGlobals();});
describe('native preview cards',()=>{
 it('restores a persisted native card address only while its public content matches',()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div id="SE-11111111-2222-3333-4444-555555555555" class="se-component se-oglink"><strong class="se-oglink-title">실제 제목</strong><p class="se-oglink-summary">요약</p><p class="se-oglink-url">blog.naver.com</p></div>');
  const reader=new EditorReader();readers.push(reader);const card=reader.read().blocks.find(b=>b.kind==='link-card')!;expect(card.linkCard).toBeUndefined();
  const url='https://blog.naver.com/example_blog/10002';reader.rememberLinkCard(card.id,url);const reference=reader.cardReference(card.componentId!)!;
  document.querySelector('.se-oglink-title')!.textContent='실제\u00a0제목';
  const reopened=new EditorReader();readers.push(reopened);reopened.seedCardReferences([reference]);expect(reopened.read().linkedUrls).toContain(url);
  document.querySelector('.se-oglink-title')!.textContent='교체된 다른 카드';expect(reopened.read().blocks.find(b=>b.kind==='link-card')!.linkCard).toBeUndefined();expect(reopened.read().linkedUrls).not.toContain(url);
 });
 it('reads safe card metadata and duplicate URLs without counting preview paragraphs as body text',()=>{
  const card=document.createElement('div');card.className='se-component se-oglink';card.innerHTML='<a class="se-oglink-info"><strong class="se-oglink-title">실제 게시글 제목</strong><p class="se-text-paragraph se-oglink-summary">미리보기 설명</p><p class="se-oglink-url">blog.naver.com</p></a><img src="https://example.test/thumbnail.jpg">';
  card.querySelector('a')!.setAttribute('data-linkdata',JSON.stringify({link:'http://m.blog.naver.com/example_blog/10002?trackingCode=test'}));document.querySelector('.se-main-container')!.append(card);
  const reader=new EditorReader();readers.push(reader);const snapshot=reader.read(),block=snapshot.blocks.find(b=>b.kind==='link-card')!;
  expect(block.linkCard).toEqual({url:'https://blog.naver.com/example_blog/10002',title:'실제 게시글 제목',description:'미리보기 설명',image:'https://example.test/thumbnail.jpg',domain:'blog.naver.com'});
  expect(snapshot.linkedUrls).toContain(block.linkCard!.url);expect(snapshot.blocks.filter(b=>b.text==='미리보기 설명')).toHaveLength(0);
 });
 it('ignores unsafe and malformed card URL attributes',()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('beforeend','<div class="se-component se-oglink"><a data-linkdata="broken" href="javascript:alert(1)"><strong class="se-oglink-title">잘못된 카드</strong></a></div>');
  const reader=new EditorReader();readers.push(reader);expect(reader.read().blocks.find(b=>b.kind==='link-card')!.linkCard).toBeUndefined();expect(reader.read().linkedUrls).not.toContain('javascript:alert(1)');
 });
});
describe('editor reader and fail-closed adapter',()=>{
 it('keeps title identity and revision stable when Naver normalizes pasted nonbreaking spaces on save',()=>{
  document.body.insertAdjacentHTML('afterbegin','<div class="se-documentTitle"><p class="se-text-paragraph">검수\u00a0초안</p></div>');
  const reader=new EditorReader();readers.push(reader);const before=reader.read();document.querySelector('.se-documentTitle p')!.textContent='검수 초안';
  const after=reader.read();expect(after.title).toBe('검수 초안');expect(after.documentKey).toBe(before.documentKey);expect(after.revision).toBe(before.revision);
 });
 it('reads marks and protects quotes, headings, tables and photos',()=>{const reader=new EditorReader();readers.push(reader);const snap=reader.read();expect(snap.editable).toBe(true);expect(snap.blocks[0].runs.some(r=>r.marks.bold)).toBe(true);expect(snap.linkedUrls).toContain('https://blog.naver.com/example_blog/10001');expect(snap.blocks.map(b=>b.kind)).toEqual(['paragraph','heading','quote','table','photo']);expect(snap.blocks.at(-1)?.photo?.caption).toBe('사진 캡션');});
 it('remembers a selection when focus moves outside the editor',()=>{const reader=new EditorReader();readers.push(reader);const span=document.querySelector('p b')!,range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);reader.captureSelection();expect(reader.read().selection?.start).toBe(3);expect(reader.read().selection?.end).toBe(8);document.querySelector<HTMLButtonElement>('#outside')!.focus();expect(reader.read().selection?.valid).toBe(true);});
 it('remembers a clicked paragraph independently of glyph selection and invalidates changed text',()=>{
  const reader=new EditorReader();readers.push(reader);window.getSelection()!.removeAllRanges();const p=document.querySelector('p')!;
  p.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  const target=reader.read().paragraphTarget;expect(target?.blockId).toBe(reader.read().blocks[0].id);
  p.textContent='다른 본문';expect(reader.read().paragraphTarget).toBeUndefined();
 });
 it('clears the click target after keyboard movement so an older paragraph cannot be reused',()=>{
  const reader=new EditorReader();readers.push(reader);const p=document.querySelector('p')!;
  p.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));expect(reader.read().paragraphTarget).toBeDefined();
  document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowDown',bubbles:true}));expect(reader.read().paragraphTarget).toBeUndefined();
 });
 it('does not use the end paragraph of a multi-paragraph drag as a quotation target',()=>{
  const reader=new EditorReader();readers.push(reader);const paragraphs=document.querySelectorAll('p');
  paragraphs[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));paragraphs[1].dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  expect(reader.read().paragraphTarget).toBeUndefined();
 });
 it('captures a selection that settles after the native mouse event',async()=>{
  const reader=new EditorReader();readers.push(reader);window.getSelection()!.removeAllRanges();
  document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  const range=document.createRange();range.selectNodeContents(document.querySelector('p b')!);window.getSelection()!.addRange(range);
  await new Promise(resolve=>setTimeout(resolve,90));
  expect(reader.read().selection).toMatchObject({start:3,end:8,text:'굵은 글자',valid:true});
 });
 it('selects only the clicked paragraph across existing rich text and line breaks',async()=>{
  document.querySelector('p')!.innerHTML='<span>앞줄 👨‍👩‍👧‍👦</span><br><b>뒷줄</b>';
  const reader=new EditorReader();readers.push(reader);const before=reader.read(),block=before.blocks[0];
  await reader.selectAt(block.id,2);expect(reader.read().selection?.collapsed).toBe(true);
  await reader.selectParagraph(block.id);expect(reader.read().selection).toMatchObject({blockId:block.id,endBlockId:block.id,start:0,end:block.text.length,text:block.text,collapsed:false});
  expect(reader.read().revision).toBe(before.revision);expect(reader.read().blocks).toEqual(before.blocks);
 });
 it('invalidates a changed target paragraph',()=>{const reader=new EditorReader();readers.push(reader);const b=document.querySelector('p b')!,range=document.createRange();range.selectNodeContents(b);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();b.textContent='수정된 문장';expect(reader.read().selection?.valid).toBe(false);});
 it('requires a target selection before formatting',async()=>{const adapter=new NativeAdapter();readers.push(adapter.reader);const before=document.querySelector('.se-main-container')!.innerHTML;const result=await adapter.handle({type:'format',preset:PRESETS[2]});expect(result.ok).toBe(false);expect(document.querySelector('.se-main-container')!.innerHTML).toBe(before);});
});
describe('range offsets and grouped photo metadata',()=>{
 it('restores positions after existing BR line breaks',()=>{
  document.querySelector('p')!.innerHTML='앞줄<br>뒷줄';const reader=new EditorReader();readers.push(reader);const block=reader.read().blocks[0];
  const range=reader.rangeAt(block.id,4);expect(range.startContainer.textContent).toBe('뒷줄');expect(range.startOffset).toBe(1);
 });
 it('invalidates a selection if a middle paragraph changes',()=>{
  const editable=document.querySelector('[contenteditable]')!;editable.innerHTML='<p class="se-text-paragraph">첫째</p><p class="se-text-paragraph">둘째</p><p class="se-text-paragraph">셋째</p>';
  const nodes=[...editable.querySelectorAll('p')],reader=new EditorReader();readers.push(reader);const range=document.createRange();range.setStart(nodes[0].firstChild!,0);range.setEnd(nodes[2].firstChild!,2);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();expect(reader.read().selection?.valid).toBe(true);
  nodes[1].textContent='가운데를 수정';expect(reader.read().selection?.valid).toBe(false);
 });
 it('captures every image in a group and keeps its caption once',()=>{
  const component=document.querySelector('.se-image')!;component.className='se-component se-imageGroup';component.innerHTML='<img src="https://example.test/one.png" alt="첫째" width="100"><img src="https://example.test/two.png" alt="둘째" width="200"><div class="se-module-image-caption"><p class="se-text-paragraph">묶음 캡션</p></div>';
  const reader=new EditorReader();readers.push(reader);const blocks=reader.read().blocks,photo=blocks.find(b=>b.kind==='photo')!.photo!;
  expect(photo.groupSize).toBe(2);expect(photo.items?.map(i=>i.src)).toEqual(['https://example.test/one.png','https://example.test/two.png']);expect(photo.caption).toBe('묶음 캡션');expect(blocks.filter(b=>b.text==='묶음 캡션')).toHaveLength(1);
 });
});

describe('protected-area selection does not retain an older body target',()=>{
 it('clears the remembered body selection when a caption is selected',()=>{
  const reader=new EditorReader();readers.push(reader);const range=document.createRange();range.selectNodeContents(document.querySelector('p b')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();expect(reader.read().selection?.valid).toBe(true);
  range.selectNodeContents(document.querySelector('.se-module-image-caption')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();expect(reader.read().selection).toBeNull();
 });
});

describe('observed Naver writing canvas structure',()=>{
 it('stops a cancelled scan before scrolling to any photo',async()=>{
  const photo=document.querySelector<HTMLElement>('.se-image')!;photo.innerHTML='<img src="data:image/svg+xml;base64,AA==">';photo.scrollIntoView=vi.fn();
  const reader=new EditorReader();readers.push(reader);const controller=new AbortController();controller.abort();
  await expect(reader.loadPendingPhotos(100,{signal:controller.signal})).rejects.toThrow('자동 확인을 멈췄');expect(photo.scrollIntoView).not.toHaveBeenCalled();
 });
 it('leaves the user scroll position alone when a scan is interrupted',async()=>{
  const root=document.querySelector<HTMLElement>('.se-main-container')!,photo=document.querySelector<HTMLElement>('.se-image')!,controller=new AbortController();root.scrollTop=50;photo.innerHTML='<img src="data:image/svg+xml;base64,AA==">';
  photo.scrollIntoView=()=>{root.scrollTop=900;controller.abort();};const reader=new EditorReader();readers.push(reader);
  await expect(reader.loadPendingPhotos(100,{signal:controller.signal,restoreScroll:()=>false})).rejects.toThrow('자동 확인을 멈췄');expect(root.scrollTop).toBe(900);
 });
 it('loads each lazy photo group through public scrolling and restores the viewport',async()=>{
  const root=document.querySelector<HTMLElement>('.se-main-container')!;root.scrollTop=80;
  document.querySelector('.se-image')!.outerHTML=['one','two'].map(id=>'<div id="'+id+'" class="se-component se-imageGroup"><img class="se-image-resource" src="data:image/svg+xml;base64,AA=="><img class="se-image-resource" src="data:image/svg+xml;base64,AA=="></div>').join('');
  const visited:string[]=[];
  for(const group of root.querySelectorAll<HTMLElement>('.se-imageGroup'))group.scrollIntoView=()=>{visited.push(group.id);root.scrollTop+=500;group.querySelectorAll('img').forEach((img,index)=>{img.src='https://example.test/'+group.id+index+'.png';});};
  const reader=new EditorReader();readers.push(reader);await reader.loadPendingPhotos();
  expect(visited).toEqual(['one','two']);expect(root.scrollTop).toBe(80);expect(reader.read().mediaPending).toBe(false);expect(reader.read().blocks.filter(b=>b.photo).flatMap(b=>b.photo!.items)).toHaveLength(4);
 });
 it('rejects an unresolved lazy placeholder without fabricating a photo URL',async()=>{
  const photo=document.querySelector<HTMLElement>('.se-image')!;photo.innerHTML='<img class="se-image-resource" src="data:image/svg+xml;base64,AA==">';photo.scrollIntoView=()=>{};
  const reader=new EditorReader();readers.push(reader);await expect(reader.loadPendingPhotos(60)).rejects.toThrow('다시 불러오지');expect(reader.read().mediaPending).toBe(true);expect(reader.read().blocks.find(b=>b.photo)?.photo?.src).toBe('');
 });
 it('keeps unloaded photos in the inventory and excludes editing controls and empty-caption hints',()=>{
  document.querySelector('.se-image')!.innerHTML='<img class="se-image-resource" src="data:image/svg+xml;base64,AA==" width="693"><button>사진 삭제</button><div class="se-caption"><p class="se-text-paragraph"><span></span><span class="se-placeholder">사진 설명을 입력하세요.</span></p><div class="__se-toolbar-slot">도구 메뉴</div></div>';
  const reader=new EditorReader();readers.push(reader);const snap=reader.read(),photo=snap.blocks.find(b=>b.kind==='photo')!;
  expect(snap.mediaPending).toBe(true);expect(photo.photo?.groupSize).toBe(1);expect(photo.photo?.src).toBe('');expect(photo.text).toBe('');
  expect(snap.blocks.flatMap(b=>b.runs).map(r=>r.text).join('')).not.toContain('사진 삭제');
 });
 it('does not change document revision when photo editing UI or empty placeholders change',()=>{
  const image=document.querySelector('.se-image')!;image.innerHTML='<img class="se-image-resource" src="https://example.test/photo.png" width="693"><div class="se-caption"><p class="se-text-paragraph"><span></span><span class="se-placeholder">사진 설명을 입력하세요.</span></p></div>';
  const reader=new EditorReader();readers.push(reader);const before=reader.read();
  image.querySelector('img')!.classList.add('__se-selected');image.querySelector('.se-placeholder')!.remove();image.insertAdjacentHTML('beforeend','<button>사진 삭제</button><div class="__se-toolbar-slot">사진 편집</div>');
  expect(reader.read().revision).toBe(before.revision);expect(reader.read().mediaPending).toBe(false);
 });
 it('protects real captions while ignoring the caption toolbar',()=>{
  document.querySelector('.se-module-image-caption')!.innerHTML='<p class="se-text-paragraph">실제 사진 캡션</p><div class="__se-toolbar-slot">굵게</div><button>삭제</button>';
  const reader=new EditorReader();readers.push(reader);expect(reader.read().blocks.find(b=>b.photo)?.photo?.caption).toBe('실제 사진 캡션');
 });
 it('does not treat the title placeholder as a named test draft',()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('afterbegin','<div class="se-documentTitle"><p class="se-text-paragraph"><span></span><span class="se-placeholder">제목</span></p></div>');
  const reader=new EditorReader();readers.push(reader);expect(reader.read().title).toBe('');
 });
 it('reads the title paragraph before its component and excludes title editing labels',()=>{
  document.querySelector('.se-main-container')!.insertAdjacentHTML('afterbegin','<div class="se-documentTitle"><div class="se-title-text"><p class="se-text-paragraph">검증 제목</p></div><div>위치이동제목 배경 사진 삭제취소확인</div></div>');
  const reader=new EditorReader();readers.push(reader);const before=reader.read();expect(before.title).toBe('검증 제목');
  document.querySelector('.se-documentTitle > div:last-child')!.remove();expect(reader.read().revision).toBe(before.revision);
 });
 it('reads native se-link data-href marks for preservation and duplicate detection',()=>{
  document.querySelector('p')!.innerHTML='<span class="se-link __se-node" data-href="https://blog.naver.com/example_blog/10001">네이버 링크</span><span data-href="https://example.test/ignored">일반 속성</span><span class="se-link" data-href="javascript:alert(1)">위험 링크</span>';
  const reader=new EditorReader();readers.push(reader);const snap=reader.read();expect(snap.linkedUrls).toEqual(['https://blog.naver.com/example_blog/10001']);expect(snap.blocks[0].runs[0].marks.href).toBe('https://blog.naver.com/example_blog/10001');
 });
 it('counts a photo group containing image components only once',()=>{
  document.querySelector('.se-image')!.outerHTML='<div class="se-component se-imageGroup"><div class="se-component se-image"><img src="https://example.test/one.png"></div><div class="se-component se-image"><img src="https://example.test/two.png"></div></div>';
  const reader=new EditorReader();readers.push(reader);const photos=reader.read().blocks.filter(b=>b.photo);expect(photos).toHaveLength(1);expect(photos[0].photo?.groupSize).toBe(2);
 });
 it('reads the se-components-wrap canvas while excluding the title and keeping photos and quotations',()=>{
  document.body.innerHTML='<div class="se-container"><div class="se-content __se-scroll-target"><div class="se-canvas se-native-selection-hidden"><div class="se-components-wrap"><div class="se-component se-documentTitle"><p class="se-text-paragraph">검증 제목</p></div><div class="se-component se-text"><div class="se-component-content"><div class="se-drop-indicator"><div class="se-section se-section-text"><div class="se-module se-module-text __se-unit"><p class="se-text-paragraph se-text-paragraph-align-center">읽을 본문</p></div></div></div></div></div><div class="se-component se-image"><img src="https://example.test/photo.png" alt="원본 사진"/><div class="se-caption">캡션</div></div><div class="se-component se-quotation"><p class="se-text-paragraph">인용구 보존</p></div></div></div></div></div>';
  const reader=new EditorReader();readers.push(reader);
  expect(reader.getRoot()?.className).toBe('se-components-wrap');
  const snapshot=reader.read();expect(snapshot.title).toBe('검증 제목');
  expect(snapshot.blocks.map(b=>b.kind)).toEqual(['paragraph','photo','quote']);
  expect(snapshot.blocks[0].text).toBe('읽을 본문');expect(snapshot.blocks[1].photo?.caption).toBe('캡션');
  expect(snapshot).not.toHaveProperty('capabilities');
 });
 it('does not mistake a components wrapper outside the Naver canvas for an editor',()=>{
  document.body.innerHTML='<div class="se-components-wrap"><p class="se-text-paragraph">관련 없는 내용</p></div>';
  const reader=new EditorReader();readers.push(reader);expect(reader.getRoot()).toBeNull();expect(reader.read().blocks).toEqual([]);
 });
});
