// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PresetDialog} from '../src/ui/PresetDialog';
import {NAVER_COLORS,NAVER_QUOTE_STYLES} from '../src/core/naver-format-options';
import type {Preset} from '../src/core/types';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const saveButton=()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='프리셋 저장')!;
async function render(preset:Preset,onSave=vi.fn(async(_preset:Preset)=>{}),onClose=vi.fn()){await act(async()=>root.render(<PresetDialog preset={preset} onSave={onSave} onClose={onClose}/>));return {onSave,onClose};}
async function click(label:string){const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===label);expect(button,label+' / '+[...host.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')).join(',')).toBeDefined();await act(async()=>button!.click());}
describe('supported preset palette and legacy correction',()=>{
 it('shows six quotation previews and saves a selected shape without retaining conflicting legacy alignment',async()=>{
  const preset:Preset={id:'quote',name:'인용구',description:'내 설명',format:{paragraphStyle:'quote',color:'#555555',bold:true,align:'left'}},original=structuredClone(preset),onSave=vi.fn(async(_preset:Preset)=>{});await render(preset,onSave);
  expect(host.querySelectorAll('.quote-style-grid>button')).toHaveLength(6);expect(host.querySelectorAll('.quote-style-grid .quote-visual')).toHaveLength(6);expect(host.querySelector('.quote-style-grid [aria-pressed="true"]')?.textContent).toContain('버티컬 라인');
  for(const option of NAVER_QUOTE_STYLES){await click(option.label+' · '+option.name);expect(host.querySelector('.quote-style-grid [aria-pressed="true"]')?.getAttribute('aria-label')).toBe(option.label+' · '+option.name);expect(saveButton().disabled).toBe(false);}
  await act(async()=>saveButton().click());expect(onSave).toHaveBeenCalledWith({...preset,format:{paragraphStyle:'quote',color:'#555555',bold:true,quoteStyle:'quotation_corner'}});expect(preset).toEqual(original);
 });
 it('clears quotation layout when switching the preset back to ordinary paragraphs',async()=>{
  const onSave=vi.fn(async(_preset:Preset)=>{});await render({id:'quote',name:'문단',description:'',format:{paragraphStyle:'quote',quoteStyle:'quotation_bubble',color:'#555555'}},onSave);
  const select=host.querySelector<HTMLSelectElement>('[aria-label="문단 스타일 선택"]')!;
  await act(async()=>{select.value='body';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.querySelector('.quote-style-grid')).toBeNull();await act(async()=>saveButton().click());expect(onSave.mock.calls[0][0].format).toEqual({paragraphStyle:'body',color:'#555555'});
 });
 it('corrects a legacy unsupported color using only palette choices while preserving other properties',async()=>{
  const preset:Preset={id:'custom',name:'예전 파랑',description:'내 설명',format:{fontSize:16,color:'#1c5cf2',bold:true,background:'#c2f4db',align:'center'}},original=structuredClone(preset),onSave=vi.fn(async(_preset:Preset)=>{});await render(preset,onSave);
  expect(saveButton().disabled).toBe(true);expect(host.querySelector('[role="status"]')?.textContent).toContain('#1c5cf2');expect(host.querySelector('input[type="color"]')).toBeNull();
  await click('글자색 선택');const tiles=[...host.querySelectorAll<HTMLButtonElement>('[aria-label="글자색 네이버 지원 색상"] button')];
  expect(tiles.map(button=>button.getAttribute('aria-label')!.replace('글자색 ',''))).toEqual(NAVER_COLORS);expect(tiles.some(button=>button.title==='#1c5cf2')).toBe(false);
  await click('글자색 #0078cb');expect(saveButton().disabled).toBe(false);expect(host.querySelector('[role="status"]')).toBeNull();await act(async()=>saveButton().click());
  expect(onSave).toHaveBeenCalledWith({...preset,format:{...preset.format,color:'#0078cb'}});expect(preset).toEqual(original);
 });
 it('uses the same supported palette for an unsupported background without changing the text color',async()=>{
  const preset:Preset={id:'background',name:'예전 배경',description:'',format:{color:'#141414',background:'#ffcafe'}},onSave=vi.fn(async(_preset:Preset)=>{});await render(preset,onSave);
  expect(saveButton().disabled).toBe(true);await click('배경색 선택');expect(host.querySelectorAll('[aria-label="배경색 네이버 지원 색상"] button')).toHaveLength(NAVER_COLORS.length);
  await click('배경색 #fff8b2');await act(async()=>saveButton().click());expect(onSave).toHaveBeenCalledWith({...preset,format:{color:'#141414',background:'#fff8b2'}});
 });
 it('keeps an unchecked color disabled instead of inserting a default value into the preset',async()=>{
  const preset:Preset={id:'size',name:'크기만',description:'',format:{fontSize:16}},onSave=vi.fn(async(_preset:Preset)=>{});await render(preset,onSave);
  const color=host.querySelector<HTMLButtonElement>('[aria-label="글자색 선택"]')!;expect(color.disabled).toBe(true);await click('글자색 선택');expect(host.querySelector('[aria-label="글자색 네이버 지원 색상"]')).toBeNull();
  await act(async()=>saveButton().click());expect(onSave).toHaveBeenCalledWith(preset);
 });
 it('recognizes uppercase supported colors and closes the palette with Escape without closing the editor',async()=>{
  const {onClose}=await render({id:'green',name:'초록',description:'',format:{color:'#00B976'}});await click('글자색 선택');expect(host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe('글자색 #00b976');
  await act(async()=>host.querySelector('[aria-pressed="true"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(onClose).not.toHaveBeenCalled();expect(host.querySelector('[aria-label="글자색 네이버 지원 색상"]')).toBeNull();expect(document.activeElement).toBe(host.querySelector('[aria-label="글자색 선택"]'));
 });
 it('shows only supported quotation alignment and lets a legacy background be cleared',async()=>{
  await render({id:'quote',name:'예전 인용구',description:'',format:{paragraphStyle:'quote',align:'right',background:'#c2f4db'}});
  const align=host.querySelector<HTMLSelectElement>('[aria-label="문단 정렬 선택"]')!;expect([...align.options].map(option=>option.value)).not.toContain('right');expect(saveButton().disabled).toBe(true);
  await act(async()=>{align.value='left';align.dispatchEvent(new Event('change',{bubbles:true}));});
  const background=[...host.querySelectorAll<HTMLInputElement>('.preset-color-field input')].at(-1)!;expect(background.disabled).toBe(false);await act(async()=>background.click());expect(saveButton().disabled).toBe(false);expect(background.disabled).toBe(true);expect(host.querySelector<HTMLButtonElement>('[aria-label="배경색 선택"]')!.disabled).toBe(true);
 });
});
