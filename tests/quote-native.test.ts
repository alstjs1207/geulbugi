// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EditorReader} from '../src/editor/reader';
import {PublicEditorUI} from '../src/editor/public-ui';
import {NAVER_QUOTE_STYLES} from '../src/core/naver-format-options';

let reader:EditorReader;
function select(){const range=document.createRange();range.selectNodeContents(document.querySelector('.se-quote p')??document.querySelector('p')!);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);reader.captureSelection();}
function quote(style:string){document.querySelector('p')!.outerHTML='<div id="native-quote" class="se-component se-quotation se-l-'+style+'"><div class="se-section se-section-quotation se-l-'+style+'"><div class="se-module se-quote"><p class="se-text-paragraph"><span style="font-weight:700">검증할 본문</span></p></div></div></div>';}
function changeStyle(style:string){const component=document.querySelector('.se-quotation')!,section=component.querySelector('.se-section')!;component.className='se-component se-quotation se-l-'+style;section.className='se-section se-section-quotation se-l-'+style;}
beforeEach(()=>{
 document.body.style.color='#000000';document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><p class="se-text-paragraph"><span style="font-weight:700">검증할 본문</span></p></div></div>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});reader=new EditorReader();select();
});
afterEach(()=>{reader.dispose();window.getSelection()?.removeAllRanges();vi.restoreAllMocks();document.body.innerHTML='';document.body.style.color='';});
describe('observed native quotation component and toolbar',()=>{
 for(const option of NAVER_QUOTE_STYLES)it('reads and selects the exact property layout '+option.value,async()=>{
  const add=vi.fn(),insert=vi.fn();document.body.insertAdjacentHTML('beforeend','<button id="convert" aria-label="인용구로 변경"></button><button id="add" aria-label="인용구 추가"></button><button data-group="documentToolbar" data-name="quotation" data-value="'+option.value+'">'+option.label+'</button>');document.querySelector('#add')!.addEventListener('click',add);document.querySelector('[data-group="documentToolbar"]')!.addEventListener('click',insert);
  document.querySelector('#convert')!.addEventListener('click',()=>{quote('default');const button=document.createElement('button');button.dataset.group='propertyToolbar';button.dataset.name='quotation-layout';button.dataset.value=option.value;button.innerHTML='<span class="se-blind">'+option.label+'</span><span>'+option.label+'</span>';button.addEventListener('click',()=>changeStyle(option.value));document.body.append(button);});
  await new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote',quoteStyle:option.value});expect(reader.read().blocks[0].quoteStyle).toBe(option.value);expect(reader.read().blocks[0].text).toBe('검증할 본문');expect(add).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();
 });
 it('waits for late property controls and a delayed model update',async()=>{
  quote('default');select();setTimeout(()=>{const button=document.createElement('button');button.dataset.group='propertyToolbar';button.dataset.name='quotation-layout';button.dataset.value='quotation_bubble';button.addEventListener('click',()=>{setTimeout(()=>changeStyle('quotation_bubble'),250);});document.body.append(button);},100);
  await new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote',quoteStyle:'quotation_bubble'});expect(reader.read().blocks[0].quoteStyle).toBe('quotation_bubble');
 });
 it('preserves an existing quotation layout when only glyph properties are specified',async()=>{
  quote('quotation_postit');select();const edited=vi.fn();await new PublicEditorUI(reader,edited).format({paragraphStyle:'quote',bold:true});expect(reader.read().blocks[0].quoteStyle).toBe('quotation_postit');expect(edited).not.toHaveBeenCalled();
 });
 it('rejects a mislabeled control whose data value points to another shape',async()=>{
  quote('default');select();document.body.insertAdjacentHTML('beforeend','<button data-group="propertyToolbar" data-name="quotation-layout" data-value="quotation_line">인용구 3</button>');const click=vi.fn();document.querySelector('button')!.addEventListener('click',click);
  await expect(new PublicEditorUI(reader,vi.fn()).format({paragraphStyle:'quote',quoteStyle:'quotation_bubble'})).rejects.toThrow('모양 도구');expect(click).not.toHaveBeenCalled();expect(reader.read().blocks[0].quoteStyle).toBe('default');
 });
 it('invalidates a remembered selection when only the quotation shape changes',()=>{
  quote('quotation_line');select();const before=reader.read();expect(before.selection?.valid).toBe(true);changeStyle('quotation_corner');const after=reader.read();expect(after.revision).not.toBe(before.revision);expect(after.selection?.valid).toBe(false);
 });
});
