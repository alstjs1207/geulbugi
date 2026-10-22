import {PendingNativeEditError} from '../src/editor/native-operation';
// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EditorReader} from '../src/editor/reader';
import {PublicEditorUI,PendingNativeLinebreakError} from '../src/editor/public-ui';

let reader:EditorReader,input:Document;
beforeEach(()=>{
 document.body.style.color='#000000';
 document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><p class="se-text-paragraph"><span style="font-weight:700">검증할 본문</span></p></div></div><iframe id="input_buffer123"></iframe>';
 input=document.querySelector('iframe')!.contentDocument!;input.body.setAttribute('contenteditable','true');input.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span>';
 reader=new EditorReader();
});
afterEach(()=>{vi.useRealTimers();reader.dispose();window.getSelection()?.removeAllRanges();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML='';document.body.style.color='';});

function nativeCardDialog(options:{loadPreview?:boolean;previewDelay?:number;insertCard?:boolean;insertImageDelay?:number;afterSearch?:()=>void;initialLookupDelay?:number;keepCopiedPreviewDuringSearch?:boolean}={}){
 const url='https://blog.naver.com/example_blog/10001',title='<b>검증</b> & "제목"';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:20,left:0,top:0,right:100,bottom:20} as DOMRect);
 vi.spyOn(input.defaultView!,'focus').mockImplementation(()=>{});
 const range=reader.rangeAt(reader.read().blocks[0].id,reader.read().blocks[0].text.length);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
 const caret=input.createRange();caret.selectNodeContents(input.body);caret.collapse(false);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(caret);
 const keys=vi.fn(),paste=vi.fn(),confirm=vi.fn(),close=vi.fn();input.body.addEventListener('keydown',keys);input.body.addEventListener('paste',paste);
 const toolbar=document.createElement('button');toolbar.textContent='링크 추가';document.body.append(toolbar);
 toolbar.addEventListener('click',()=>{
  const popup=document.createElement('div');popup.className='se-popup se-popup-oglink';popup.innerHTML='<input class="se-popup-oglink-input" type="url"><button class="se-popup-oglink-button">검색</button><div class="se-popup-oglink-preview"></div><button class="se-popup-button-confirm" disabled>확인</button><button class="se-popup-close-button">팝업 닫기</button>';document.body.append(popup);
  const field=popup.querySelector<HTMLInputElement>('input')!;
  // Controlled native inputs only accept the value after a public input event.
  let entered='';field.addEventListener('input',()=>{entered=field.value;});
  const loading=document.createElement('div');loading.className='se-popup-oglink-loading';popup.append(loading);
  if(options.initialLookupDelay!==undefined){
   field.value='https://clipboard.example/previous';loading.classList.add('se-is-on');
   setTimeout(()=>{if(!popup.isConnected)return;loading.classList.remove('se-is-on');popup.querySelector('.se-popup-oglink-preview')!.innerHTML='<p class="se-popup-oglink-no-result">이전 주소 조회 실패</p>';popup.querySelector<HTMLButtonElement>('.se-popup-button-confirm')!.disabled=true;},options.initialLookupDelay);
  }
  if(options.keepCopiedPreviewDuringSearch){popup.querySelector('.se-popup-oglink-preview')!.innerHTML='<strong class="se-oglink-title">이전 클립보드 카드</strong>';popup.querySelector<HTMLButtonElement>('.se-popup-button-confirm')!.disabled=false;}
  popup.querySelector('button')!.addEventListener('click',()=>{
   expect(entered).toBe(url);options.afterSearch?.();
   if(options.keepCopiedPreviewDuringSearch)loading.classList.add('se-is-on');
   if(options.loadPreview!==false)setTimeout(()=>{
    if(!popup.isConnected)return;
    const preview=popup.querySelector('.se-popup-oglink-preview')!;preview.innerHTML='<div class="se-oglink-thumbnail"><img src="https://example.test/card.jpg"></div><strong class="se-oglink-title"></strong><p class="se-oglink-summary">본문 요약</p><p class="se-oglink-url">blog.naver.com</p>';preview.querySelector('strong')!.textContent=title;popup.querySelector<HTMLButtonElement>('.se-popup-button-confirm')!.disabled=false;loading.classList.remove('se-is-on');
   },options.previewDelay??180);
  });
  popup.querySelector('.se-popup-button-confirm')!.addEventListener('click',()=>{
   confirm();if(options.insertCard!==false){const card=document.createElement('div');card.id='SE-11111111-2222-3333-4444-555555555555';card.className='se-component se-oglink';card.innerHTML=popup.querySelector('.se-popup-oglink-preview')!.innerHTML;if(options.insertImageDelay){const image=card.querySelector('.se-oglink-thumbnail')!;image.remove();setTimeout(()=>card.prepend(image),options.insertImageDelay);}document.querySelector('.se-main-container')!.append(card);}popup.remove();
  });
  popup.querySelector('.se-popup-close-button')!.addEventListener('click',()=>{close();popup.remove();});
 });
 return {url,title,paste,keys,confirm,close,toolbar};
}

describe('native link dialog and paragraph input paths',()=>{
 it('waits for the copied URL lookup so its late failure cannot overwrite the requested card',async()=>{
  vi.useFakeTimers();const {url,title,confirm}=nativeCardDialog({initialLookupDelay:400}),edited=vi.fn(),pending=new PublicEditorUI(reader,edited).insertLinkCard(url);
  await vi.advanceTimersByTimeAsync(300);expect(confirm).not.toHaveBeenCalled();expect(document.querySelector<HTMLInputElement>('.se-popup-oglink-input')!.value).toBe('https://clipboard.example/previous');
  await vi.advanceTimersByTimeAsync(400);await pending;expect(confirm).toHaveBeenCalledOnce();expect(reader.read().blocks.find(b=>b.kind==='link-card')?.linkCard).toMatchObject({url,title});
 });
 it('closes a stuck copied URL lookup while preserving the body and its undo history',async()=>{
  vi.useFakeTimers();const {url,confirm,close}=nativeCardDialog({initialLookupDelay:20_000}),edited=vi.fn(),before=reader.read().revision,pending=new PublicEditorUI(reader,edited).insertLinkCard(url),result=expect(pending).rejects.toThrow('초기 조회');
  await vi.advanceTimersByTimeAsync(15_100);await result;expect(confirm).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(reader.read().revision).toBe(before);
 });
 it('does not confirm a copied card while the requested preview is still loading',async()=>{
  vi.useFakeTimers();const {url,title,confirm}=nativeCardDialog({keepCopiedPreviewDuringSearch:true}),pending=new PublicEditorUI(reader,vi.fn()).insertLinkCard(url);
  await vi.advanceTimersByTimeAsync(100);expect(confirm).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(200);await pending;expect(reader.read().blocks.find(b=>b.kind==='link-card')?.linkCard).toMatchObject({url,title});
 });
 it('inserts only the fetched native card without pasting or deleting body text',async()=>{
  const {url,title,paste,keys,confirm}=nativeCardDialog(),edited=vi.fn();
  await new PublicEditorUI(reader,edited).insertLinkCard(url);
  expect(edited).toHaveBeenCalledOnce();expect(confirm).toHaveBeenCalledOnce();expect(paste).not.toHaveBeenCalled();expect(keys).not.toHaveBeenCalled();expect(reader.read().linkedUrls).toEqual([url]);expect(reader.read().blocks.find(b=>b.kind==='link-card')?.linkCard).toMatchObject({url,title,description:'본문 요약',image:'https://example.test/card.jpg'});
  expect(reader.read().blocks.filter(b=>b.kind==='paragraph').map(b=>b.text)).toEqual(['검증할 본문']);expect(document.querySelector<HTMLElement>('p span')!.style.fontWeight).toBe('700');
 });
 it('closes a timed out preview without editing the body or authorizing undo',async()=>{
  vi.useFakeTimers();const {url,confirm,close,keys}=nativeCardDialog({loadPreview:false}),edited=vi.fn(),before=reader.read().revision,pending=new PublicEditorUI(reader,edited).insertLinkCard(url);
  const result=expect(pending).rejects.toThrow('불러오지 못');
  await vi.advanceTimersByTimeAsync(15_100);await result;
  expect(edited).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(keys).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
 it('waits for a slow preview before a single insertion and never selects the URL',async()=>{
  vi.useFakeTimers();const {url,keys,confirm}=nativeCardDialog({previewDelay:8_000}),edited=vi.fn(),pending=new PublicEditorUI(reader,edited).insertLinkCard(url);
  await vi.advanceTimersByTimeAsync(7_900);expect(confirm).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('검증할 본문');
  await vi.advanceTimersByTimeAsync(300);await pending;expect(confirm).toHaveBeenCalledOnce();expect(edited).toHaveBeenCalledOnce();expect(keys).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('검증할 본문');
 });
 it('waits for a delayed card thumbnail when its preview contained an image',async()=>{
  vi.useFakeTimers();const {url,confirm,keys}=nativeCardDialog({insertImageDelay:400}),edited=vi.fn(),done=vi.fn(),pending=new PublicEditorUI(reader,edited).insertLinkCard(url).then(done);
  await vi.advanceTimersByTimeAsync(300);expect(confirm).toHaveBeenCalledOnce();expect(done).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(400);await pending;expect(reader.read().blocks.find(b=>b.kind==='link-card')?.linkCard?.image).toBe('https://example.test/card.jpg');expect(keys).not.toHaveBeenCalled();
 });
 it('accepts a card image delayed beyond the old two-second deadline with one confirmation',async()=>{
  vi.useFakeTimers();const {url,confirm,keys}=nativeCardDialog({insertImageDelay:4_000}),edited=vi.fn(),done=vi.fn(),pending=new PublicEditorUI(reader,edited).insertLinkCard(url).then(done);
  await vi.advanceTimersByTimeAsync(3_000);expect(done).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1_500);await pending;expect(confirm).toHaveBeenCalledOnce();expect(edited).toHaveBeenCalledOnce();expect(keys).not.toHaveBeenCalled();expect(reader.read().linkedUrls).toEqual([url]);
 });
 it('cancels if the preview URL is changed before loading completes',async()=>{
  const {url,confirm}=nativeCardDialog({afterSearch:()=>{document.querySelector<HTMLInputElement>('.se-popup-oglink-input')!.value='https://blog.naver.com/other_blog/123';}}),edited=vi.fn();
  await expect(new PublicEditorUI(reader,edited).insertLinkCard(url)).rejects.toThrow('취소');expect(confirm).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('검증할 본문');
 });
 it('cancels before insertion if the user edits the body during preview loading',async()=>{
  const {url,confirm,close,keys}=nativeCardDialog({afterSearch:()=>{document.querySelector('p span')!.textContent='사용자가 추가한 본문';}}),edited=vi.fn();
  await expect(new PublicEditorUI(reader,edited).insertLinkCard(url)).rejects.toThrow('본문');expect(confirm).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(keys).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('사용자가 추가한 본문');
 });
 it('does not submit a preview after the native popup is cancelled',async()=>{
  const {url,confirm}=nativeCardDialog({afterSearch:()=>document.querySelector('.se-popup-oglink')!.remove()}),edited=vi.fn();
  await expect(new PublicEditorUI(reader,edited).insertLinkCard(url)).rejects.toThrow('취소');expect(confirm).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();
 });
 it('does not reuse a native popup already opened by the user',async()=>{
  const {url,toolbar,confirm}=nativeCardDialog();toolbar.click();const popup=document.querySelector('.se-popup-oglink');
  await expect(new PublicEditorUI(reader,vi.fn()).insertLinkCard(url)).rejects.toThrow('닫');expect(document.querySelector('.se-popup-oglink')).toBe(popup);expect(confirm).not.toHaveBeenCalled();
 });
 it('refuses to open the dialog when the live native input selection contains body text',async()=>{
  const {url}=nativeCardDialog();input.body.append(input.createTextNode('검증할 본문'));const range=input.createRange();range.selectNodeContents(input.body);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(range);
  await expect(new PublicEditorUI(reader,vi.fn()).insertLinkCard(url)).rejects.toThrow('커서');expect(document.querySelector('.se-popup-oglink')).toBeNull();
 });
 it('does not delete anything if a whole-body selection appears after native confirmation',async()=>{
  const {url,keys,confirm}=nativeCardDialog();confirm.mockImplementation(()=>{input.body.append(input.createTextNode('검증할 본문'));const range=input.createRange();range.selectNodeContents(input.body);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(range);});
  await new PublicEditorUI(reader,vi.fn()).insertLinkCard(url);expect(keys).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('검증할 본문');
 });
 it('reports an uncertain import after confirmation without issuing keyboard cleanup',async()=>{
  vi.useFakeTimers();const {url,keys}=nativeCardDialog({insertCard:false}),edited=vi.fn(),pending=new PublicEditorUI(reader,edited).insertLinkCard(url),result=expect(pending).rejects.toThrow('삽입 완료');
  await vi.advanceTimersByTimeAsync(18_000);await result;expect(edited).toHaveBeenCalledOnce();expect(keys).not.toHaveBeenCalled();expect(document.querySelector('p')!.textContent).toBe('검증할 본문');
 });
 it('does not authorize undo history when the editor ignores Enter',async()=>{
  const edited=vi.fn(),before=reader.read().revision;
  const caret=input.createRange();caret.selectNodeContents(input.body);caret.collapse(false);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(caret);
  await expect(new PublicEditorUI(reader,edited).insertParagraph()).rejects.toThrow('문단 나누기');
  expect(edited).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
 it('never sends Enter while the native input still selects body text',async()=>{
  input.body.append(input.createTextNode('선택된 글자'));const range=input.createRange();range.selectNodeContents(input.body);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(range);const keys=vi.fn(),edited=vi.fn();input.body.addEventListener('keydown',keys);const before=reader.read().revision;
  await expect(new PublicEditorUI(reader,edited).insertParagraph()).rejects.toThrow('선택한 글자');expect(keys).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
});

describe('public SmartEditor undo keyboard path',()=>{
 for(const platform of ['MacIntel','Win32'])it('dispatches undo to the input frame on '+platform,async()=>{
  vi.spyOn(navigator,'platform','get').mockReturnValue(platform);
  const events:KeyboardEvent[]=[];input.body.addEventListener('keydown',event=>{const key=event as KeyboardEvent;events.push(key);event.preventDefault();document.querySelector<HTMLElement>('p span')!.style.fontWeight='400';});
  const original=reader.read().revision,ui=new PublicEditorUI(reader,vi.fn());
  expect(await ui.undo()).toBe(true);expect(reader.read().revision).not.toBe(original);expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({key:'z',code:'KeyZ',keyCode:90,metaKey:platform==='MacIntel',ctrlKey:platform!=='MacIntel'});
  expect((events[0].target as Node).ownerDocument).toBe(input);
 });
 it('treats an unchanged consumed history attempt as unconfirmed without resending',async()=>{
  input.body.addEventListener('keydown',event=>event.preventDefault());
  vi.useFakeTimers();const original=reader.read().revision,pending=new PublicEditorUI(reader,vi.fn()).undo().then(()=>null,error=>error);await vi.advanceTimersByTimeAsync(2200);expect(await pending).toBeInstanceOf(PendingNativeEditError);expect(reader.read().revision).toBe(original);
 });
});

describe('public bold toggle labels',()=>{
 it('removes bold from a mixed selection through the native on and off toggles',async()=>{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
  document.querySelector('p')!.innerHTML='<span style="font-weight:400">일반</span><span style="font-weight:700">굵게</span>';
  const button=document.createElement('button');button.setAttribute('aria-label','굵기 적용');let active=false;button.addEventListener('click',()=>{active=!active;document.querySelectorAll<HTMLElement>('p span').forEach(span=>span.style.fontWeight=active?'700':'400');button.setAttribute('aria-label',active?'굵기 해제':'굵기 적용');});document.body.append(button);
  const range=document.createRange();range.selectNodeContents(document.querySelector('p')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({bold:false});expect(reader.read().blocks[0].runs.every(r=>!r.marks.bold)).toBe(true);expect(edited).toHaveBeenCalledTimes(2);
 });
 it('can remove existing bold using the live 굵기 해제 label',async()=>{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
  const button=document.createElement('button');button.setAttribute('aria-label','굵기 해제');button.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='400';});document.body.append(button);
  const range=document.createRange();range.selectNodeContents(document.querySelector('p span')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({bold:false});expect(reader.read().blocks[0].runs[0].marks.bold).toBe(false);expect(edited).toHaveBeenCalledOnce();
 });
});

describe('observed native formatting options',()=>{
 beforeEach(()=>{vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});const range=document.createRange();range.selectNodeContents(document.querySelector('p span')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();});
 it('selects a font size when its visible label and tooltip repeat the same number',async()=>{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
  document.body.insertAdjacentHTML('beforeend','<button aria-label="글자 크기 변경" id="size"></button>');
  document.querySelector('#size')!.addEventListener('click',()=>{const option=document.createElement('button');option.dataset.name='font-size';option.dataset.value='fs16';option.className='se-toolbar-option-font-size-code-fs16-button';option.innerHTML='<span class="se-toolbar-option-label">16</span><span class="se-toolbar-tooltip">16</span>';option.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.fontSize='16px';});document.body.append(option);});
  const range=document.createRange();range.selectNodeContents(document.querySelector('p span')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
  await new PublicEditorUI(reader,vi.fn()).format({fontSize:16});expect(reader.read().blocks[0].runs[0].marks.fontSize).toBe(16);
 });
 it('accepts an identical color repeated in recent colors and the native palette',async()=>{
  document.body.insertAdjacentHTML('beforeend','<button aria-label="글자색 변경" id="color"></button>');
  document.querySelector('#color')!.addEventListener('click',()=>{const menu=document.createElement('div');menu.className='se-color-picker-option';menu.innerHTML='<button data-color="#00b976">최근 색상</button><button data-color="#00b976">팔레트</button>';menu.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.color='#00b976';}));document.body.append(menu);});
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({color:'#00B976'});expect(edited).toHaveBeenCalledOnce();expect(reader.read().blocks[0].runs[0].marks.color).toBe('rgb(0, 185, 118)');
 });
 it('uses selection conversion for quotations instead of inserting a blank quotation',async()=>{
  document.body.insertAdjacentHTML('beforeend','<button aria-label="인용구 추가" id="add"></button><button aria-label="인용구로 변경" id="convert"></button>');
  const add=vi.fn();document.querySelector('#add')!.addEventListener('click',add);document.querySelector('#convert')!.addEventListener('click',()=>{document.querySelector('p')!.outerHTML='<blockquote><p class="se-text-paragraph" style="text-align:center"><span style="font-weight:700">검증할 본문</span></p></blockquote>';});
  await new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote'});expect(add).not.toHaveBeenCalled();expect(reader.read().blocks[0].kind).toBe('quote');
 });
 it('uses quotation layout and preserves source glyphs after native 19px/italic conversion',async()=>{
  const original=document.querySelector<HTMLElement>('p span')!;original.style.fontSize='15px';original.style.textDecoration='underline';reader.captureSelection();
  document.body.insertAdjacentHTML('beforeend','<button aria-label="인용구로 변경" id="convert"></button><button aria-label="글자 크기 변경" id="size"></button><button aria-label="밑줄 적용" id="underline"></button>');
  document.querySelector('#convert')!.addEventListener('click',()=>{
   document.querySelector('p')!.outerHTML='<blockquote><p class="se-text-paragraph" style="text-align:center"><span style="font-weight:700;font-size:19px;font-style:italic">검증할 본문</span></p></blockquote>';
   const layout=document.createElement('button');layout.dataset.group='propertyToolbar';layout.dataset.name='quotation-layout';layout.dataset.value='quotation_line';layout.innerHTML='<span class="se-blind">인용구 2</span><span class="se-toolbar-tooltip">인용구 2</span>';layout.addEventListener('click',()=>{document.querySelector('blockquote')!.className='se-l-quotation_line';document.querySelector<HTMLElement>('p')!.style.textAlign='left';document.querySelector<HTMLElement>('p span')!.style.fontStyle='normal';});document.body.append(layout);
  });
  document.querySelector('#size')!.addEventListener('click',()=>{const option=document.createElement('button');option.dataset.name='font-size';option.dataset.value='fs15';option.textContent='15';option.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.fontSize='15px';});document.body.append(option);});
  document.querySelector('#underline')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.textDecoration='underline';});
  await new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote',align:'left'});const block=reader.read().blocks[0];expect(block.kind).toBe('quote');expect(block.align).toBe('left');expect(block.runs[0].marks).toMatchObject({fontSize:15,italic:false,bold:true,underline:true});
 });
 for(const background of ['#c2f4db','#ffffff'])it('rejects a source background before quotation conversion '+background,async()=>{
  document.querySelector<HTMLElement>('p span')!.style.backgroundColor=background;reader.captureSelection();
  document.body.insertAdjacentHTML('beforeend','<button aria-label="인용구로 변경" id="convert"></button>');const convert=vi.fn();document.querySelector('#convert')!.addEventListener('click',convert);
  const before=reader.read().revision,edited=vi.fn();await expect(new PublicEditorUI(reader,edited).format({paragraphStyle:'quote',align:'left'})).rejects.toThrow('배경색이 있는 인용구');expect(convert).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
 it('rejects a quotation background requested by a preset before conversion',async()=>{
  document.body.insertAdjacentHTML('beforeend','<button aria-label="인용구로 변경" id="convert"></button>');const convert=vi.fn();document.querySelector('#convert')!.addEventListener('click',convert);
  const before=reader.read().revision,edited=vi.fn();await expect(new PublicEditorUI(reader,edited).format({paragraphStyle:'quote',background:'#ffffff'})).rejects.toThrow('배경색이 있는 인용구');expect(convert).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
 it('does not apply bold before rejecting an unsupported preset color',async()=>{
  const click=vi.fn();document.body.insertAdjacentHTML('beforeend','<button aria-label="굵기 적용" id="bold"></button>');document.querySelector('#bold')!.addEventListener('click',click);
  await expect(new PublicEditorUI(reader,vi.fn()).format({bold:false,color:'#202824'})).rejects.toThrow('지원하지 않는 색상');expect(click).not.toHaveBeenCalled();
 });
 for(const content of ['<span>일반 </span><b>굵게</b>','<a href="https://blog.naver.com/example_blog/10001">기존 링크</a>'])it('rejects unsupported quote preservation before editing '+content,async()=>{
  document.querySelector('p')!.innerHTML=content;const range=document.createRange();range.selectNodeContents(document.querySelector('p')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
  document.body.insertAdjacentHTML('beforeend','<button aria-label="인용구로 변경" id="convert"></button>');const convert=vi.fn();document.querySelector('#convert')!.addEventListener('click',convert);
  const before=reader.read().revision;await expect(new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote'})).rejects.toThrow('링크나 서로 다른 글자 서식');expect(convert).not.toHaveBeenCalled();expect(reader.read().revision).toBe(before);
 });
 it('counts a native edit whose model update is delayed beyond the toolbar click',async()=>{
  document.body.insertAdjacentHTML('beforeend','<button aria-label="굵기 해제" id="delayed"></button>');
  document.querySelector('#delayed')!.addEventListener('click',()=>{setTimeout(()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='400';},120);});
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({bold:false});expect(edited).toHaveBeenCalledOnce();expect(reader.read().blocks[0].runs[0].marks.bold).toBe(false);
 });
 it('finds alignment through its native label even when the title attribute is empty',async()=>{
  document.body.insertAdjacentHTML('beforeend','<button title="">왼쪽 정렬</button>');
  document.body.insertAdjacentHTML('beforeend','<button aria-label="정렬 열기" id="align"></button>');
  document.querySelector('#align')!.addEventListener('click',()=>{const menu=document.createElement('div');menu.innerHTML='<button title=""><span class="se-toolbar-option-label">왼쪽 정렬</span><span class="se-toolbar-tooltip">왼쪽 정렬</span></button>';menu.querySelector('button')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p')!.style.textAlign='left';});document.body.append(menu);});
  await new PublicEditorUI(reader,vi.fn()).format({align:'left'});expect(reader.read().blocks[0].align).toBe('left');
 });
 it('uses an already open alignment listbox without closing it or clicking unrelated floating tools',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='left';reader.captureSelection();
  document.body.insertAdjacentHTML('beforeend','<button aria-label="가운데 정렬" id="floating"></button><div><button aria-label="정렬 닫기" aria-expanded="true" aria-controls="alignment" id="align"></button><div role="listbox" id="alignment"><button aria-label="가운데 정렬 선택됨" id="center"><span class="se-toolbar-option-label">가운데 정렬</span><span>선택됨</span></button></div></div>');
  const close=vi.fn(),floating=vi.fn();document.querySelector('#align')!.addEventListener('click',close);document.querySelector('#floating')!.addEventListener('click',floating);document.querySelector('#center')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p')!.style.textAlign='center';});
  await new PublicEditorUI(reader,vi.fn()).format({align:'center'});expect(reader.read().blocks[0].align).toBe('center');expect(close).not.toHaveBeenCalled();expect(floating).not.toHaveBeenCalled();
 });
 it('waits for the native alignment popup to finish rendering instead of failing at 40ms',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='left';reader.captureSelection();document.body.insertAdjacentHTML('beforeend','<div id="tools"><button aria-label="정렬 열기" aria-expanded="false" aria-controls="delayed-menu" id="align"></button></div>');
  document.querySelector('#align')!.addEventListener('click',()=>{document.querySelector('#align')!.setAttribute('aria-expanded','true');setTimeout(()=>{const menu=document.createElement('div');menu.id='delayed-menu';menu.setAttribute('role','listbox');menu.innerHTML='<button aria-label="오른쪽 정렬">오른쪽 정렬</button>';menu.querySelector('button')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p')!.style.textAlign='right';});document.querySelector('#tools')!.append(menu);},160);});
  await new PublicEditorUI(reader,vi.fn()).format({align:'right'});expect(reader.read().blocks[0].align).toBe('right');
 });
 it('uses reused menu elements within the controlled listbox and ignores similarly named tools',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='left';reader.captureSelection();document.body.insertAdjacentHTML('beforeend','<button aria-label="가운데 정렬" id="floating"></button><div><button aria-label="정렬 열기" aria-expanded="false" aria-controls="reused-menu" id="align"></button><div role="listbox" id="reused-menu" hidden><div role="option"><button aria-label="가운데 정렬" id="center">가운데 정렬</button></div></div></div>');
  const floating=vi.fn();document.querySelector('#floating')!.addEventListener('click',floating);document.querySelector('#align')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('#reused-menu')!.hidden=false;document.querySelector('#align')!.setAttribute('aria-expanded','true');});document.querySelector('#center')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p')!.style.textAlign='center';});
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({align:'center'});expect(reader.read().blocks[0].align).toBe('center');expect(edited).toHaveBeenCalledOnce();expect(floating).not.toHaveBeenCalled();
 });
 it('skips a matching paragraph alignment while still applying requested glyph changes',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='center';reader.captureSelection();document.body.insertAdjacentHTML('beforeend','<button aria-label="굵기 해제" id="bold"></button>');document.querySelector('#bold')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='400';});
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({align:'center',bold:false});expect(reader.read().blocks[0].align).toBe('center');expect(reader.read().blocks[0].runs[0].marks.bold).toBe(false);expect(edited).toHaveBeenCalledOnce();
 });
 it('fails an unavailable alignment before changing bold or color',async()=>{
  document.querySelector<HTMLElement>('p')!.style.textAlign='left';reader.captureSelection();document.body.insertAdjacentHTML('beforeend','<div><button aria-label="정렬 열기" aria-controls="missing-menu" id="align"></button><div role="listbox" id="missing-menu" hidden><button aria-label="왼쪽 정렬">왼쪽 정렬</button></div></div><button aria-label="굵기 해제" id="bold"></button><button aria-label="글자색 변경" id="color"></button>');
  const glyph=vi.fn();document.querySelector('#bold')!.addEventListener('click',glyph);document.querySelector('#color')!.addEventListener('click',glyph);document.querySelector('#align')!.addEventListener('click',()=>{const menu=document.querySelector<HTMLElement>('#missing-menu')!;menu.hidden=!menu.hidden;});
  const before=reader.read().revision,edited=vi.fn();await expect(new PublicEditorUI(reader,edited).format({bold:false,color:'#00b976',align:'center'})).rejects.toThrow('정렬 옵션');expect(reader.read().revision).toBe(before);expect(glyph).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();
 });
});

it('waits for a delayed native Enter update before continuing',async()=>{
 vi.useFakeTimers();
 const selection=input.defaultView!.getSelection()!,range=input.createRange();range.selectNodeContents(input.body);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
 input.body.addEventListener('keydown',event=>{event.preventDefault();setTimeout(()=>{const p=document.querySelector('p')!;p.after(p.cloneNode(true));},350);});
 const edited=vi.fn(),pending=new PublicEditorUI(reader,edited).insertParagraph();
 await vi.advanceTimersByTimeAsync(200);let done=false;void pending.then(()=>done=true);await Promise.resolve();expect(done).toBe(false);
 await vi.advanceTimersByTimeAsync(400);await pending;expect(reader.read().blocks).toHaveLength(2);expect(edited).toHaveBeenCalledOnce();
});

it('sends Enter only once and reports an unconfirmed native operation on timeout',async()=>{
 vi.useFakeTimers();const selection=input.defaultView!.getSelection()!,range=input.createRange();range.selectNodeContents(input.body);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
 const keys=vi.fn((event:Event)=>event.preventDefault());input.body.addEventListener('keydown',keys);
 const edited=vi.fn(),pending=new PublicEditorUI(reader,edited).insertParagraph().then(()=>null,error=>error);
 await vi.advanceTimersByTimeAsync(2200);expect(await pending).toBeInstanceOf(PendingNativeLinebreakError);expect(keys).toHaveBeenCalledOnce();expect(edited).toHaveBeenCalledOnce();expect(reader.read().blocks).toHaveLength(1);
});
