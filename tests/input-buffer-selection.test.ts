// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { EditorReader } from '../src/editor/reader';

let reader:EditorReader,frame:HTMLIFrameElement,doc:Document;
beforeEach(()=>{
 document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph">문장 <b>굵은 글자</b><a href="https://blog.naver.com/example_blog/10001">링크</a></p><p class="se-text-paragraph">둘째 문단</p></div></div></div><iframe id="input_buffer123"></iframe><button id="outside">패널</button>';
 frame=document.querySelector('iframe')!;doc=frame.contentDocument!;
 doc.body.setAttribute('contenteditable','true');doc.body.innerHTML='<span data-input-buffer="observed-native-buffer"></span>';
 vi.spyOn(doc.defaultView!,'focus').mockImplementation(()=>{});
 reader=new EditorReader();
});
afterEach(()=>{vi.useRealTimers();reader.dispose();window.getSelection()?.removeAllRanges();vi.restoreAllMocks();document.body.innerHTML='';});
function choose(text:string,anchor:number,options:{collapsed?:boolean;event?:string}={}){
 const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,anchor),visible=window.getSelection()!;
 visible.removeAllRanges();visible.addRange(caret);
 doc.body.innerHTML='<span data-input-buffer="observed-native-buffer"></span>';
 const node=doc.createTextNode(text);doc.body.append(node);
 const range=doc.createRange();range.selectNodeContents(node);if(options.collapsed)range.collapse(false);
 const selection=doc.defaultView!.getSelection()!;selection.removeAllRanges();selection.addRange(range);
 doc.dispatchEvent(new Event(options.event??'selectionchange'));
}
function nativeCaret(offset:number){
 document.body.insertAdjacentHTML('beforeend',`<div class="se-selection"><div class="se-caret" style="display:none;left:${offset*10}px;top:20px;height:15px"></div></div>`);
 const original=reader.rangeAt.bind(reader);
 vi.spyOn(reader,'rangeAt').mockImplementation((id,at)=>{
  const range=original(id,at),index=reader.read().blocks.findIndex(block=>block.id===id);range.getClientRects=()=>[{left:at*10,top:20+index*40,height:15}] as unknown as DOMRectList;return range;
 });
}

describe('observed SmartEditor input buffer selection',()=>{
 it.each([{offset:3,key:'ArrowLeft'},{offset:8,key:'ArrowRight'}])('collapses a selected native word to its verified endpoint $offset before editing',async({offset,key})=>{
  nativeCaret(offset);choose('굵은 글자',3);const block=reader.read().blocks[0];reader.elements.get(block.id)!.scrollIntoView=vi.fn();
  const Original=document.defaultView!.MouseEvent;vi.spyOn(document.defaultView!,'MouseEvent').mockImplementation(class extends Original{constructor(type:string,init?:MouseEventInit){super(type,{...init,view:null});}});
  const keys:string[]=[];doc.body.addEventListener('keydown',event=>{const e=event as KeyboardEvent;keys.push(e.key);e.preventDefault();if(e.key==='ArrowLeft')doc.defaultView!.getSelection()!.collapseToStart();else if(e.key==='ArrowRight')doc.defaultView!.getSelection()!.collapseToEnd();});
  const html=document.querySelector('.se-main-container')!.innerHTML;await reader.selectAt(block.id,offset);expect(keys).toEqual([key]);expect(doc.defaultView!.getSelection()!.isCollapsed).toBe(true);expect(reader.read().selection).toMatchObject({start:offset,end:offset,collapsed:true});expect(document.querySelector('.se-main-container')!.innerHTML).toBe(html);
 });
 it('does not collapse an ambiguous selected word at a cursor inside that word',async()=>{
  nativeCaret(4);choose('굵은 글자',3);const block=reader.read().blocks[0];reader.elements.get(block.id)!.scrollIntoView=vi.fn();const Original=document.defaultView!.MouseEvent;vi.spyOn(document.defaultView!,'MouseEvent').mockImplementation(class extends Original{constructor(type:string,init?:MouseEventInit){super(type,{...init,view:null});}});
  const html=document.querySelector('.se-main-container')!.innerHTML;await expect(reader.selectAt(block.id,4)).rejects.toThrow('선택');expect(doc.defaultView!.getSelection()!.toString()).toBe('굵은 글자');expect(document.querySelector('.se-main-container')!.innerHTML).toBe(html);
 });
 it('restores the sole cursor position in a completely empty body paragraph with a placeholder',async()=>{
  const paragraph=document.querySelector('p')!;paragraph.innerHTML='<span></span><span class="se-placeholder">본문을 입력하세요.</span>';
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const top=this===paragraph?100:this.tagName==='P'?200:0;return {left:50,top,right:650,bottom:top+30,width:600,height:this.tagName==='P'?30:0,x:50,y:top,toJSON:()=>({})};});
  document.body.insertAdjacentHTML('beforeend','<div class="se-selection"><div class="se-caret" style="left:0px;top:103px;height:15px"></div></div>');
  const block=reader.read().blocks[0],visible=reader.rangeAt(block.id,0);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(visible);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toMatchObject({blockId:block.id,start:0,end:0,valid:true,collapsed:true});
  document.querySelector<HTMLButtonElement>('#outside')!.focus();await reader.selectAt(block.id,0);
  expect(reader.commandDocument()).toBe(doc);expect(reader.restoreSelection().startContainer.ownerDocument).toBe(doc);expect(paragraph.textContent).toBe('본문을 입력하세요.');
 });
 it('tracks keyboard movement from a stale text anchor into a different empty paragraph',()=>{
  const paragraphs=document.querySelectorAll('p');paragraphs[1].innerHTML='<span></span>';
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const top=this===paragraphs[0]?20:this===paragraphs[1]?100:0;return {left:0,top,right:600,bottom:top+30,width:600,height:this.tagName==='P'?30:0,x:0,y:top,toJSON:()=>({})};});
  document.body.insertAdjacentHTML('beforeend','<div class="se-selection"><div class="se-caret" style="left:0px;top:103px;height:15px"></div></div>');
  const blocks=reader.read().blocks;window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(reader.rangeAt(blocks[0].id,3));
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toMatchObject({blockId:blocks[1].id,start:0,end:0,valid:true,collapsed:true});
 });
 it('binds a known insertion range only when native selected text agrees despite a stale visible anchor',()=>{
  const block=reader.read().blocks[0];choose('굵은 글자',0);expect(reader.read().selection).toBeNull();
  expect(reader.captureExpectedInputSelection(block.id,3,8)).toBe(true);
  expect(reader.read().selection).toMatchObject({start:3,end:8,text:'굵은 글자',valid:true,collapsed:false});
  expect(reader.restoreSelection(true).startContainer.ownerDocument).toBe(doc);
 });
 it('rejects a supplied insertion range that does not match the actual native selection',()=>{
  const block=reader.read().blocks[0];choose('굵은 글자',0);
  expect(reader.captureExpectedInputSelection(block.id,0,3)).toBe(false);
  expect(reader.read().selection).toBeNull();
 });
 it('restores a native caret in the completely empty input body without a marker',()=>{
  nativeCaret(3);
  const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,3);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toMatchObject({start:3,end:3,valid:true,collapsed:true});
  document.querySelector<HTMLButtonElement>('#outside')!.focus();
  expect(reader.commandDocument()).toBe(doc);expect(reader.restoreSelection().startContainer.ownerDocument).toBe(doc);
 });
 it('maps a click to its paragraph when native DOM selection is anchored on the canvas',()=>{
  nativeCaret(3);const block=reader.read().blocks[0],visible=document.createRange();visible.selectNodeContents(document.querySelector('.se-editor')!);visible.collapse(true);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(visible);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.body.focus();
  document.querySelector('p b')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));document.querySelector('p b')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toMatchObject({blockId:block.id,start:3,end:3,valid:true,collapsed:true});expect(reader.restoreSelection().startContainer.ownerDocument).toBe(doc);
 });
 it('does not accept a clicked paragraph without a matching native caret',()=>{
  nativeCaret(999);const visible=document.createRange();visible.selectNodeContents(document.querySelector('.se-editor')!);visible.collapse(true);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(visible);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.body.focus();
  document.querySelector('p b')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));document.querySelector('p b')!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toBeNull();expect(reader.read().selectionIssue).toContain('커서 위치');
 });
 it('uses the editor caret after keyboard movement leaves a stale visible DOM anchor',()=>{
  const block=reader.read().blocks[0];nativeCaret(block.text.length);
  const old=reader.rangeAt(block.id,3);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(old);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toMatchObject({start:block.text.length,end:block.text.length,valid:true,collapsed:true});
 });
 it('also uses the actual caret when keyboard movement leaves a collapsed marked buffer',()=>{
  const block=reader.read().blocks[0];nativeCaret(block.text.length);choose('굵은 글자',3,{collapsed:true,event:'keyup'});
  expect(reader.read().selection).toMatchObject({start:block.text.length,end:block.text.length,valid:true,collapsed:true});
 });
 it('keeps the native caret when panel focus triggers a main-document selection event',()=>{
  const block=reader.read().blocks[0];nativeCaret(block.text.length);choose('굵은 글자',3,{collapsed:true,event:'keyup'});
  document.querySelector<HTMLButtonElement>('#outside')!.focus();document.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({start:block.text.length,end:block.text.length,valid:true,collapsed:true});
  expect(reader.restoreSelection().startContainer.ownerDocument).toBe(doc);
 });
 it('rejects a native caret whose public geometry no longer matches the paragraph',()=>{
  nativeCaret(999);const block=reader.read().blocks[0],old=reader.rangeAt(block.id,3);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(old);
  doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toBeNull();expect(reader.read().selectionIssue).toContain('커서 위치');
 });
 it('does not edit when public pointer events fail to move the native caret to the requested offset',async()=>{
  nativeCaret(0);const block=reader.read().blocks[0],html=document.querySelector('.se-main-container')!.innerHTML;
  reader.elements.get(block.id)!.scrollIntoView=vi.fn();
  const NativeMouseEvent=document.defaultView!.MouseEvent;
  vi.spyOn(document.defaultView!,'MouseEvent').mockImplementation(class extends NativeMouseEvent{constructor(type:string,init?:MouseEventInit){super(type,{...init,view:null});}});
  await expect(reader.selectAt(block.id,3)).rejects.toThrow('요청 위치');
  expect(document.querySelector('.se-main-container')!.innerHTML).toBe(html);
 });
 it('does not treat arbitrary unmarked input contents as the native empty caret',()=>{
  const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,3);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.textContent='검증되지 않은 입력 영역';const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('keyup'));
  expect(reader.read().selection).toBeNull();expect(reader.commandDocument()).toBe(document);
 });
 it('ignores an empty editable iframe outside the recognized native frame IDs',()=>{
  frame.id='unrelated-input';doc.body.replaceChildren();const range=doc.createRange();range.selectNodeContents(doc.body);range.collapse(true);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);reader.read();
  expect(reader.commandDocument()).toBe(document);
 });
 it('excludes the observed FEFF sentinel when keyboard selection covers the input body',()=>{
  const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,block.text.length);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span>';
  doc.body.append(doc.createTextNode(block.text));
  const range=doc.createRange();range.selectNodeContents(doc.body);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({start:0,end:block.text.length,text:block.text,valid:true,collapsed:false});
  expect(reader.restoreSelection(true).toString()).toBe(block.text);
  expect(doc.body.firstChild!.textContent).toBe('\uFEFF');
 });
 it('preserves a FEFF character in the actual text after the input marker',()=>{
  document.querySelector('p')!.textContent='\uFEFF실제 본문';
  const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,block.text.length);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span>';
  doc.body.append(doc.createTextNode(block.text));
  const range=doc.createRange();range.selectNodeContents(doc.body);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({start:0,end:block.text.length,text:'\uFEFF실제 본문',valid:true});
 });
 it('excludes standalone native boundary sentinels around a rich selection',()=>{
  const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,block.text.length);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span><span>문장 </span><span>굵은 글자</span><span>링크</span>\uFEFF';
  const range=doc.createRange();range.selectNodeContents(doc.body);doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({start:0,end:block.text.length,text:block.text,valid:true});expect(reader.restoreSelection(true).toString()).toBe(block.text);
 });
 it('preserves an actual final FEFF inside a rich payload span',()=>{
  document.querySelector('p')!.textContent='실제 본문\uFEFF';const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,block.text.length);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  doc.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span><span>실제 본문\uFEFF</span>\uFEFF';
  const range=doc.createRange();range.selectNodeContents(doc.body);doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({text:'실제 본문\uFEFF',valid:true});expect(reader.restoreSelection(true).toString()).toBe('실제 본문\uFEFF');
 });
 it('does not strip arbitrary characters before an unrecognized marker prefix',()=>{
  choose('굵은 글자',8);
  doc.body.insertBefore(doc.createTextNode('다른 접두사'),doc.body.firstChild);
  const range=doc.createRange();range.selectNodeContents(doc.body);
  doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(range);doc.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toBeNull();
 });
 it('reads selected text from the input iframe instead of the collapsed visible caret',()=>{
  const before=document.querySelector('.se-main-container')!.innerHTML;
  choose('굵은 글자',8);
  expect(reader.read().selection).toMatchObject({start:3,end:8,text:'굵은 글자',collapsed:false,valid:true});
  expect(document.querySelector('.se-main-container')!.innerHTML).toBe(before);
 });
 it('maps a unique input selection when the rendered caret remains inside the selected text',()=>{
  choose('굵은 글자',5);
  expect(reader.read().selection).toMatchObject({start:3,end:8,text:'굵은 글자',collapsed:false,valid:true});
 });
 it('maps a backward selection at its starting boundary',()=>{
  choose('굵은 글자',3);
  expect(reader.read().selection).toMatchObject({start:3,end:8,collapsed:false,valid:true});
 });
 it('preserves native selection when focus moves outside and restores the same input document',()=>{
  choose('굵은 글자',8);document.querySelector<HTMLButtonElement>('#outside')!.focus();
  expect(reader.read().selection?.valid).toBe(true);
  const restored=reader.restoreSelection(true);
  expect(restored.startContainer.ownerDocument).toBe(doc);expect(restored.toString()).toBe('굵은 글자');
  expect(doc.defaultView!.getSelection()!.toString()).toBe('굵은 글자');
 });
 it('rejects the saved range after the target paragraph changes',()=>{
  choose('굵은 글자',8);document.querySelector('p b')!.textContent='수정된 본문';
  expect(reader.read().selection?.valid).toBe(false);expect(()=>reader.restoreSelection(true)).toThrow('다시 선택');
 });
 it('rejects a native buffer replaced while the visible paragraph remains the same',()=>{
  choose('굵은 글자',8);doc.body.replaceChildren(doc.createTextNode('다른 입력 상태'));
  expect(reader.read().selection?.valid).toBe(false);expect(()=>reader.restoreSelection(true)).toThrow('다시 선택');
 });
 it('clears an old selection when repeated text has two possible positions beside the caret',()=>{
  choose('굵은 글자',8);document.querySelector('p')!.textContent='반복반복';choose('반복',2);
  expect(reader.read().selection).toBeNull();expect(reader.read().selectionIssue).toContain('모호');
 });
 it('requires reselection when a native multi-paragraph buffer cannot be mapped exactly',()=>{
  choose('굵은 글자',8);choose('링크\n둘째 문단',10);
  expect(reader.read().selection).toBeNull();expect(reader.read().selectionIssue).toContain('다시 선택');
 });
 it('ignores an editable iframe without the observed input marker',()=>{
  doc.body.removeAttribute('contenteditable');choose('굵은 글자',8);
  expect(reader.read().selection).toBeNull();
 });
 it('updates on keyboard events in the input frame and reports only a caret after selection is removed',()=>{
  choose('굵은 글자',8,{event:'keyup'});expect(reader.read().selection?.collapsed).toBe(false);
  choose('굵은 글자',8,{collapsed:true,event:'keyup'});expect(reader.read().selection).toMatchObject({start:8,end:8,collapsed:true});
  expect(reader.restoreSelection().startContainer.ownerDocument).toBe(doc);expect(reader.commandDocument()).toBe(doc);
 });
 it('attaches to a native input frame created after the reader starts',()=>{
  frame.remove();reader.read();frame=document.createElement('iframe');frame.id='input_buffer456';document.body.append(frame);
  doc=frame.contentDocument!;doc.body.setAttribute('contenteditable','true');reader.read();choose('굵은 글자',8);
  expect(reader.read().selection).toMatchObject({text:'굵은 글자',valid:true});
 });
 it('removes nested document listeners on disposal',()=>{
  const changed=vi.fn();reader.onChange=changed;reader.dispose();choose('굵은 글자',8);expect(changed).not.toHaveBeenCalled();
 });
});

it('waits for delayed native caret placement after the public mouse click',async()=>{
 vi.useFakeTimers();nativeCaret(0);choose('',0,{collapsed:true});const block=reader.read().blocks[0];reader.elements.get(block.id)!.scrollIntoView=vi.fn();
 const Original=document.defaultView!.MouseEvent;vi.spyOn(document.defaultView!,'MouseEvent').mockImplementation(class extends Original{constructor(type:string,init?:MouseEventInit){super(type,{...init,view:null});}});
 document.querySelector('p')!.addEventListener('click',()=>{setTimeout(()=>{document.querySelector<HTMLElement>('.se-caret')!.style.left='30px';},220);});
 const pending=reader.selectAt(block.id,3).then(()=>({ok:true}),error=>({ok:false,error:String(error)}));await vi.advanceTimersByTimeAsync(1600);expect(await pending).toEqual({ok:true});expect(reader.read().selection).toMatchObject({start:3,end:3,collapsed:true});vi.useRealTimers();
});

it('keeps waiting for a delayed caret when the same unchanged native paragraph rerenders during selection',async()=>{
 vi.useFakeTimers();document.querySelector('p')!.id='SE-selection-target';nativeCaret(0);choose('',0,{collapsed:true});const block=reader.read().blocks[0];reader.elements.get(block.id)!.scrollIntoView=vi.fn();
 const Original=document.defaultView!.MouseEvent;vi.spyOn(document.defaultView!,'MouseEvent').mockImplementation(class extends Original{constructor(type:string,init?:MouseEventInit){super(type,{...init,view:null});}});
 document.querySelector('p')!.addEventListener('click',()=>{
  setTimeout(()=>{const p=document.querySelector('p')!;p.replaceWith(p.cloneNode(true));},100);
  setTimeout(()=>{document.querySelector<HTMLElement>('.se-caret')!.style.left='30px';},220);
 });
 const pending=reader.selectAt(block.id,3).then(()=>({ok:true}),error=>({ok:false,error:String(error)}));await vi.advanceTimersByTimeAsync(1600);expect(await pending).toEqual({ok:true});
});
