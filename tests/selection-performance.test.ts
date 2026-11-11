// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EditorReader} from '../src/editor/reader';
let reader:EditorReader;
beforeEach(()=>{
 document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span>첫 번째 원문</span></p><p class="se-text-paragraph"><span>중간 원문</span></p><p class="se-text-paragraph"><span>마지막 원문</span></p></div></div></div>';
 reader=new EditorReader();const range=document.createRange();range.selectNodeContents(document.querySelector('p span')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();
});
afterEach(()=>{reader.dispose();vi.restoreAllMocks();window.getSelection()?.removeAllRanges();document.body.innerHTML='';});

it('does not rescan or notify for repeated identical selections in one frame',()=>{
 const read=vi.spyOn(reader,'read'),notify=vi.fn();reader.onChange=notify;
 for(let i=0;i<15;i++)reader.captureSelection();
 expect(read).not.toHaveBeenCalled();expect(notify).not.toHaveBeenCalled();expect(reader.read().selection?.valid).toBe(true);
});

it('invalidates selection content synchronously after an inherited style change',()=>{
 const before=reader.read().selection!.signature;
 document.querySelector<HTMLElement>('[contenteditable]')!.style.fontWeight='700';reader.captureSelection();
 expect(reader.read().selection?.signature).not.toBe(before);expect(reader.read().blocks[0].runs[0].marks.bold).toBe(true);
});

it('detects a middle paragraph change before the observer callback runs',()=>{
 const spans=document.querySelectorAll('p span'),range=document.createRange();range.setStart(spans[0].firstChild!,0);range.setEnd(spans[2].firstChild!,3);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();const before=reader.read();
 spans[1].textContent='바뀐 원문';expect(reader.read().selection?.valid).toBe(false);reader.captureSelection();expect(reader.read().selection?.signature).not.toBe(before.selection!.signature);
});

it('keeps mutation verification fresh even when selection content is cached',()=>{
 const before=reader.read();document.querySelector('p span')!.setAttribute('style','color:rgb(255,0,0)');
 expect(reader.read().revision).not.toBe(before.revision);
 document.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="https://example.test/one.png"></div>');
 expect(reader.read().blocks.at(-1)?.kind).toBe('photo');
});
