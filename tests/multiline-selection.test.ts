// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EditorReader} from '../src/editor/reader';
import {PublicEditorUI} from '../src/editor/public-ui';
import {verifyPostconditions} from '../src/editor/postconditions';

let reader:EditorReader,frame:HTMLIFrameElement,input:Document;
beforeEach(()=>{
 document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><p id="first" class="se-text-paragraph">앞부분 첫째 문단</p><p id="middle" class="se-text-paragraph">둘째 문단</p><p id="last" class="se-text-paragraph">셋째 문단 뒷부분</p><p id="outside" class="se-text-paragraph">보존 문단</p></div></div><iframe id="input_buffer123"></iframe><button id="panel">패널</button>';
 frame=document.querySelector('iframe')!;input=frame.contentDocument!;input.body.setAttribute('contenteditable','true');
 vi.spyOn(input.defaultView!,'focus').mockImplementation(()=>{});reader=new EditorReader();
});
afterEach(()=>{reader.dispose();window.getSelection()?.removeAllRanges();vi.restoreAllMocks();document.body.innerHTML='';document.body.style.color='';});
function choose(parts:{id:string;html:string}[],anchorId='last',anchorOffset=5){
 const blocks=reader.read().blocks,anchor=blocks.find(block=>reader.elements.get(block.id)?.id===anchorId)!,range=reader.rangeAt(anchor.id,anchorOffset);
 window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 input.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span>'+parts.map(part=>`<p id="${part.id}" class="se-text-paragraph">${part.html}</p>`).join('')+'\uFEFF';
 const native=input.createRange();native.selectNodeContents(input.body);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(native);reader.read();input.dispatchEvent(new Event('selectionchange'));
}
const parts=[{id:'first',html:'첫째 문단'},{id:'middle',html:'둘째 문단'},{id:'last',html:'셋째 문단'}];
describe('multi-paragraph native selections',()=>{
 it.each([['last',5],['first',4]] as const)('maps a drag ending on %s and restores the actual native range', (id,offset)=>{
  choose(parts,id,offset);const snapshot=reader.read();
  expect(snapshot.selection).toMatchObject({blockId:snapshot.blocks[0].id,endBlockId:snapshot.blocks[2].id,start:4,end:5,text:'첫째 문단\n둘째 문단\n셋째 문단',valid:true,collapsed:false});
  document.querySelector<HTMLButtonElement>('#panel')!.focus();document.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toEqual(snapshot.selection);const restored=reader.restoreSelection(true);expect(restored.startContainer.ownerDocument).toBe(input);expect(restored.toString()).toBe('첫째 문단둘째 문단셋째 문단');expect(restored.cloneContents().querySelectorAll('p')).toHaveLength(3);
 });
 it('uses paragraph ids to distinguish repeated text in different paragraphs',()=>{
  document.querySelector('#first')!.textContent='반복반복';document.querySelector('#middle')!.textContent='반복';document.querySelector('#last')!.textContent='반복반복';
  choose([{id:'first',html:'반복'},{id:'middle',html:'반복'},{id:'last',html:'반복'}],'first',2);
  expect(reader.read().selection).toMatchObject({start:2,end:2,collapsed:false,text:'반복\n반복\n반복',valid:true});
 });
 it('preserves soft line breaks, empty paragraphs and NBSP offsets',()=>{
  document.querySelector('#first')!.innerHTML='앞 <b>첫째<br>줄</b>';document.querySelector('#middle')!.textContent='';document.querySelector('#last')!.textContent='셋째 문단 뒷부분';
  choose([{id:'first',html:'<b>첫째<br>줄</b>'},{id:'middle',html:''},{id:'last',html:'셋째&nbsp;문단'}]);
  expect(reader.read().selection).toMatchObject({start:2,end:5,text:'첫째\n줄\n\n셋째 문단',valid:true});
 });
 it('invalidates a remembered selection after an intermediate paragraph changes',()=>{
  choose(parts);document.querySelector('#middle')!.textContent='바뀐 둘째 문단';expect(reader.read().selection?.valid).toBe(false);expect(()=>reader.restoreSelection(true)).toThrow('다시 선택');
 });
 it('rejects stale text, missing ids and reordered copies',()=>{
  for(const payload of [[...parts.slice(0,2),{id:'last',html:'틀린 문구'}],[{id:'unknown',html:'첫째 문단'},...parts.slice(1)],[parts[1],parts[0],parts[2]]]){choose(payload);expect(reader.read().selection).toBeNull();}
 });
 it('does not silently skip a protected component between the selected paragraphs',()=>{
  document.querySelector('#middle')!.insertAdjacentHTML('beforebegin','<div class="se-component se-table"><table><tr><td>보존할 표</td></tr></table></div>');choose(parts);expect(reader.read().selection).toBeNull();expect(reader.read().selectionIssue).toContain('본문 문단만');
 });
 it('maps BR text inside one paragraph even though native Range.toString omits BR',()=>{
  document.querySelector('#first')!.innerHTML='앞 첫째<br>줄 뒷';const block=reader.read().blocks[0],caret=reader.rangeAt(block.id,2);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(caret);
  input.body.innerHTML='\uFEFF<span data-input-buffer="observed-native-buffer"></span><span>첫째<br>줄</span>\uFEFF';const range=input.createRange();range.selectNodeContents(input.body);input.defaultView!.getSelection()!.removeAllRanges();input.defaultView!.getSelection()!.addRange(range);reader.read();input.dispatchEvent(new Event('selectionchange'));
  expect(reader.read().selection).toMatchObject({start:2,end:6,text:'첫째\n줄',valid:true});
 });
 it('removes mixed bold across all selected paragraphs, including a plain first paragraph',async()=>{
  document.querySelector('#middle')!.innerHTML='<b>둘째 문단</b>';choose(parts);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30} as DOMRect);
  const button=document.createElement('button');button.setAttribute('aria-label','굵기 적용');let on=false;button.addEventListener('click',()=>{on=!on;for(const id of ['first','middle','last'])document.getElementById(id)!.style.fontWeight=on?'700':'400';document.querySelector('#middle b')?.replaceWith(document.createTextNode('둘째 문단'));});document.body.append(button);
  const edited=vi.fn();await new PublicEditorUI(reader,edited).format({bold:false});expect(edited).toHaveBeenCalledTimes(2);expect(reader.read().blocks.slice(0,3).flatMap(block=>block.runs).every(run=>!run.marks.bold)).toBe(true);
 });
 it('verifies the first and last partial boundaries and preserves the outside paragraph',()=>{
  choose(parts);const before=reader.read(),after=structuredClone(before),request={type:'format' as const,preset:{id:'bold',name:'굵게',description:'',format:{bold:true}}};
  const marks=before.blocks.map(block=>block.runs[0].marks);
  after.blocks[0].runs=[{text:'앞부분 ',marks:{...marks[0]}},{text:'첫째 문단',marks:{...marks[0],bold:true}}];after.blocks[1].runs=[{text:'둘째 문단',marks:{...marks[1],bold:true}}];after.blocks[2].runs=[{text:'셋째 문단',marks:{...marks[2],bold:true}},{text:' 뒷부분',marks:{...marks[2]}}];
  expect(()=>verifyPostconditions(before,after,request)).not.toThrow();after.blocks[0].runs[0].marks.bold=true;expect(()=>verifyPostconditions(before,after,request)).toThrow('보존');
 });
 it('does not toggle an already plain multi-paragraph selection',async()=>{
  choose(parts);const edited=vi.fn();await new PublicEditorUI(reader,edited).format({bold:false});expect(edited).not.toHaveBeenCalled();
 });
 it('converts selected paragraphs together and applies one native quotation layout',async()=>{
  document.body.style.color='#000000';choose(parts);const before=reader.read();
  const select=vi.spyOn(reader,'selectParagraphs').mockResolvedValue();vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30} as DOMRect);
  const convert=document.createElement('button');convert.setAttribute('aria-label','인용구로 변경');convert.addEventListener('click',()=>{const quote=document.createElement('blockquote');for(const id of ['first','middle','last'])quote.append(document.getElementById(id)!);document.querySelector('.se-main-container')!.prepend(quote);});document.body.append(convert);
  const layout=document.createElement('button');Object.assign(layout.dataset,{group:'propertyToolbar',name:'quotation-layout',value:'quotation_bubble'});layout.addEventListener('click',()=>{document.querySelector('blockquote')!.className='se-l-quotation_bubble';});document.body.append(layout);
  const request={type:'format' as const,preset:{id:'quote',name:'말풍선',description:'',format:{paragraphStyle:'quote' as const,quoteStyle:'quotation_bubble' as const}}};
  await new PublicEditorUI(reader,vi.fn()).format(request.preset.format);expect(select).toHaveBeenCalledWith(before.blocks[0].id,before.blocks[2].id);expect(reader.read().blocks.slice(0,3).every(block=>block.kind==='quote'&&block.quoteStyle==='quotation_bubble')).toBe(true);expect(()=>verifyPostconditions(before,reader.read(),request)).not.toThrow();expect(reader.read().blocks[3]).toEqual(before.blocks[3]);document.body.style.color='';
 });
});
