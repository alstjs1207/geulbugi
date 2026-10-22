// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { FormatApplyControls } from '../src/ui/FormatApplyControls';
import { PRESETS } from '../src/core/defaults';
import {NAVER_QUOTE_STYLES} from '../src/core/naver-format-options';
import type { Preset,Snapshot } from '../src/core/types';
let host:HTMLDivElement,root:Root,snapshot:Snapshot;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);
 snapshot={sessionId:'session',documentKey:'draft',adapterSignature:'adapter',title:'',url:'https://blog.naver.com/PostWriteForm.naver?blogId=test_blog',revision:'revision',editable:true,blocks:[{id:'p',kind:'paragraph',text:'글자를 선택',runs:[]}],selection:{blockId:'p',endBlockId:'p',start:0,end:6,text:'글자를 선택',signature:'selected',valid:true,collapsed:false},linkedUrls:[],uploadBusy:false,canUndo:false};
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(preset:Preset=PRESETS[0],options:{snapshot?:Snapshot|null;busy?:boolean;apply?:()=>void;edit?:()=>void}={}){
 await act(async()=>root.render(<FormatApplyControls snapshot={options.snapshot===undefined?snapshot:options.snapshot} preset={preset} busy={options.busy??false} onApply={options.apply??(()=>{})} onEditPreset={options.edit} undo={<button>되돌리기</button>}/>));
}
const applyButton=()=>host.querySelector<HTMLButtonElement>('button.primary')!;
describe('direct format use and actionable guidance',()=>{
 it.each(NAVER_QUOTE_STYLES)('enables $name from a caret on first use',async option=>{
  snapshot.selection={...snapshot.selection!,start:2,end:2,text:'',collapsed:true};
  await render({id:'quote',name:'인용구',description:'',format:{paragraphStyle:'quote',quoteStyle:option.value}});
  expect(applyButton().disabled).toBe(false);expect(applyButton().textContent).toBe('현재 문단에 적용');expect(host.textContent).not.toMatch(/테스트|검증/);
 });
 it('blocks an unsupported color and opens preset correction',async()=>{
  const apply=vi.fn(),edit=vi.fn();await render({...PRESETS[2],format:{bold:true,color:'#1c5cf2'}},{apply,edit});
  expect(applyButton().disabled).toBe(true);expect(host.querySelector('[role="status"]')?.textContent).toContain('#1c5cf2');
  await act(async()=>applyButton().click());expect(apply).not.toHaveBeenCalled();
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='프리셋 수정')!.click());expect(edit).toHaveBeenCalledOnce();
 });
 it('applies to an identified text range without any setup or test button',async()=>{
  const apply=vi.fn();await render(PRESETS[0],{apply});expect(applyButton().disabled).toBe(false);
  expect(host.querySelectorAll('button')).toHaveLength(2);await act(async()=>applyButton().click());expect(apply).toHaveBeenCalledOnce();
 });
 it('applies a quote to a clicked paragraph without needing an exact character caret',async()=>{
  snapshot.selection=null;snapshot.selectionIssue='글자 위치를 확인하지 못했어요.';snapshot.paragraphTarget={blockId:'p',signature:'clicked'};
  await render(PRESETS[3]);expect(applyButton().disabled).toBe(false);expect(host.textContent).not.toContain('글자 위치');
  await render(PRESETS[0]);expect(applyButton().disabled).toBe(true);
 });
 it('uses the last clicked paragraph rather than an older character bookmark',async()=>{
  snapshot.blocks.push({id:'clicked',kind:'paragraph',text:'현재 문단',runs:[]});snapshot.paragraphTarget={blockId:'clicked',signature:'clicked'};
  const {quoteTarget}=await import('../src/core/quote-target');expect(quoteTarget(snapshot)).toMatchObject({blockId:'clicked',text:'현재 문단'});
 });
 it('asks for a text selection for character formatting',async()=>{
  snapshot.selection!.collapsed=true;snapshot.selection!.end=0;const apply=vi.fn();await render(PRESETS[0],{apply});
  expect(applyButton().disabled).toBe(true);expect(host.querySelector('[role="status"]')?.textContent).toContain('드래그');
  await act(async()=>applyButton().click());expect(apply).not.toHaveBeenCalled();
 });
 it('displays a native position ambiguity without enabling apply',async()=>{
  snapshot.selection=null;snapshot.selectionIssue='선택 위치가 모호해요. 다시 선택해 주세요.';await render();
  expect(applyButton().disabled).toBe(true);expect(host.querySelector('[role="status"]')?.textContent).toContain('모호');
  expect(applyButton().getAttribute('aria-describedby')).toBe(host.querySelector('[role="status"]')?.id);
 });
 it('expands a partial selection to a whole quotation paragraph',async()=>{
  snapshot.selection!.end=2;await render(PRESETS[3]);expect(applyButton().disabled).toBe(false);
 });
 it('applies every selected paragraph instead of substituting the clicked endpoint',async()=>{
  snapshot.blocks.push({id:'another',kind:'paragraph',text:'둘째 문단',runs:[]});snapshot.selection!.endBlockId='another';snapshot.selection!.end=2;snapshot.paragraphTarget={blockId:'another',signature:'clicked'};
  await render(PRESETS[3]);expect(applyButton().disabled).toBe(false);expect(applyButton().textContent).toBe('선택 문단에 적용');
  const {quoteTarget}=await import('../src/core/quote-target');expect(quoteTarget(snapshot)).toMatchObject({blockId:'p',endBlockId:'another',start:0,end:5,text:'글자를 선택\n둘째 문단'});
 });
 it('rejects a missing endpoint and a protected block inside a quote selection',async()=>{
  snapshot.selection!.endBlockId='missing';await render(PRESETS[3]);expect(applyButton().disabled).toBe(true);
  snapshot.blocks.push({id:'table',kind:'table',text:'표',runs:[]},{id:'another',kind:'paragraph',text:'둘째 문단',runs:[]});snapshot.selection!.endBlockId='another';await render(PRESETS[3]);expect(applyButton().disabled).toBe(true);expect(host.textContent).toContain('본문 문단만');
 });
 it.each(['uploadBusy','mediaPending'] as const)('waits for %s without exposing tests',async field=>{
  snapshot[field]=true;await render(PRESETS[3]);expect(applyButton().disabled).toBe(true);expect(host.textContent).not.toMatch(/테스트|검증/);
 });
 it('directs a blocked editor to recovery',async()=>{
  snapshot.issue='초안을 확인한 뒤 다시 열어 주세요.';await render();expect(applyButton().disabled).toBe(true);expect(host.textContent).toContain('복구 안내');
 });
 it('asks to open an editor when disconnected',async()=>{
  await render(PRESETS[0],{snapshot:null});expect(applyButton().disabled).toBe(true);expect(host.textContent).toContain('글쓰기 화면');
 });
});
