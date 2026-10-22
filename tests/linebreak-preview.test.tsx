// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {BreakPreview,BreakExample} from '../src/ui/BreakPreview';
import {buildBreakPlan} from '../src/core/linebreak';
import {defaultDatabase} from '../src/core/defaults';
import {DemoEditor} from '../src/platform/demo';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI,PendingNativeLinebreakError} from '../src/editor/public-ui';
import {saveDatabase} from '../src/platform/storage';
import {sliceRuns} from '../src/core/hash';
import type {Run} from '../src/core/types';
const text=(runs:Run[])=>runs.map(run=>run.text).join('');
let root:Root|undefined,host:HTMLDivElement,adapter:NativeAdapter|undefined;
beforeEach(async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 host=document.createElement('div');document.body.append(host);await saveDatabase(defaultDatabase());
});
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;adapter?.reader.dispose();adapter=undefined;document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();});
function partialPlan(){
 const snapshot=new DemoEditor().snapshot(),block=snapshot.blocks.find(block=>block.id==='body-1')!;
 const start=block.text.indexOf('아이와'),end=block.text.indexOf('자세한');
 snapshot.selection={blockId:block.id,endBlockId:block.id,start,end,text:block.text.slice(start,end),signature:'test',valid:true,collapsed:false};
 block.align='center';return buildBreakPlan(snapshot,{...defaultDatabase().settings.rules,longLength:120});
}
describe('linebreak preview uses the complete paragraph context',()=>{
 it('retains the unselected prefix, suffix, marks and alignment',()=>{
  const plan=partialPlan(),change=plan.changes[0];
  expect(text(change.paragraphBefore!)).toBe('길이 완만해서 아이와 천천히 걷기 좋았어요. 햇살이 나뭇잎 사이로 내려와 사진을 남기기에도 좋았어요. 자세한 코스는 지난 산책 기록에 정리해 두었어요.');
  expect(text(change.paragraphAfter!)).toBe(text(sliceRuns(change.paragraphBefore!,0,change.start))+text(change.after)+text(sliceRuns(change.paragraphBefore!,change.end,text(change.paragraphBefore!).length)));
  expect(change.paragraphAfter!.find(run=>run.marks.href)?.text).toBe('지난 산책 기록');expect(change.align).toBe('center');
 });
 it('renders exact document text separately from controls and supports mobile reference mode',async()=>{
  const plan=partialPlan(),selected=new Set(plan.changes.map(c=>c.blockId)),toggle=vi.fn();root=createRoot(host);
  await act(async()=>root!.render(<BreakPreview changes={plan.changes} selected={selected} onToggle={toggle}/>));
  const copies=host.querySelectorAll<HTMLElement>('.break-preview-copy');
  expect(copies[0].textContent).toBe(text(plan.changes[0].paragraphBefore!));expect(copies[1].textContent).toBe(text(plan.changes[0].paragraphAfter!));
  expect(copies[1].querySelector('input,label')).toBeNull();expect(copies[1].style.textAlign).toBe('center');expect(copies[1].querySelector('a')?.href).toContain('/10003');
  expect(host.querySelector('.compare-columns')?.className).toContain('position-view');
  expect(copies[1].querySelectorAll('.break-marker')).toHaveLength((copies[1].textContent!.match(/\n/g)??[]).length);
  await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());expect(toggle).toHaveBeenCalledExactlyOnceWith(plan.changes[0].blockId);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='모바일 참고')!.click());expect(host.querySelector('.compare-columns')?.className).toContain('mobile-view');expect(copies[1].textContent).toBe(text(plan.changes[0].paragraphAfter!));
 });
 it('shows the complete original paragraph when unchecked, matching a skipped application',async()=>{
  const plan=partialPlan();root=createRoot(host);await act(async()=>root!.render(<BreakPreview changes={plan.changes} selected={new Set()} onToggle={()=>{}}/>));
  const copies=host.querySelectorAll('.break-preview-copy');expect(copies[1].textContent).toBe(copies[0].textContent);
 });
});
// Simulate native Enter's paragraph splitting rather than replacing text with
// change.after. This exercises the actual adapter's insertion order/offsets.
function nativeEditor(rerender=false){
 document.body.insertAdjacentHTML('afterbegin','<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph">선택 앞 문맥. <b>첫 문장입니다.</b> 다음 문장은 길이가 길어서, 구절 경계에서도 정확하게 나눠야 합니다. 선택 뒤 문맥.</p><p class="se-text-paragraph">둘째 문단입니다. <a href="https://blog.naver.com/example_blog/10003">기존 링크</a>도 보존합니다.</p></div></div></div>');
 for(const p of document.querySelectorAll('.se-text-paragraph'))p.id='SE-'+crypto.randomUUID();
 const current=new NativeAdapter();adapter=current;
 const history:string[]=[];
 vi.spyOn(PublicEditorUI.prototype,'insertParagraph').mockImplementation(async function(this:PublicEditorUI){
  const selection=window.getSelection()!,range=selection.getRangeAt(0),paragraph=(range.startContainer.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:range.startContainer as Element)!.closest('p')!;
  history.push(document.querySelector('.se-main-container')!.innerHTML);
  const tail=range.cloneRange();tail.setEnd(paragraph,paragraph.childNodes.length);
  const next=document.createElement('p');next.className=paragraph.className;next.append(tail.extractContents());if(!next.textContent)next.append(document.createElement('br'));if(!paragraph.textContent)paragraph.replaceChildren(document.createElement('br'));
  next.id='SE-'+crypto.randomUUID();paragraph.after(next);
  if(rerender){const container=document.querySelector('.se-main-container')!;container.innerHTML=container.innerHTML;}
  const resolved=document.getElementById(next.id)!;const caret=document.createRange();caret.setStart(resolved,0);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);
  (this as unknown as {didEdit:()=>void}).didEdit();
 });
 vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{const html=history.pop();if(html===undefined)return false;document.querySelector('.se-main-container')!.innerHTML=html;return true;});
 return current;
}
const logical=(blocks:ReturnType<DemoEditor['snapshot']>['blocks'])=>blocks.map(block=>(block.text==='\n'?'':block.text).replace(/\u00a0/g,' ')+'\n').join('');
describe('native Enter results match preview insertion positions',()=>{
 for(const longMode of ['meaning','length'] as const)for(const blankLines of [0,1,2] as const)it(`${longMode}, ${blankLines} blank lines: native apply and exact undo`,async()=>{
  const editor=nativeEditor(),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode,longLength:24,blankLines});
  const expected=before.blocks.map(block=>{const change=plan.changes.find(change=>change.blockId===block.id);return {...block,text:change?text(change.paragraphAfter!):block.text};});
  const result=await editor.handle({type:'linebreak',plan});expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)return;
  expect(logical(result.snapshot.blocks)).toBe(logical(expected));
  expect(await editor.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});
 });
 it('keeps unselected text and unchecked paragraphs unchanged',async()=>{
  const editor=nativeEditor(),first=editor.reader.read().blocks[0],selection=window.getSelection()!;
  const range=editor.reader.rangeAt(first.id,first.text.indexOf('첫'));const end=editor.reader.rangeAt(first.id,first.text.indexOf('선택 뒤'));range.setEnd(end.startContainer,end.startOffset);selection.removeAllRanges();selection.addRange(range);editor.reader.captureSelection();
  const before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,longLength:24});
  const applied=await editor.handle({type:'linebreak',plan});expect(applied.ok,JSON.stringify(applied)).toBe(true);if(!applied.ok)return;
  const expected=before.blocks.map(block=>({...block,text:plan.changes.find(c=>c.blockId===block.id)?.paragraphAfter?.map(r=>r.text).join('')??block.text}));expect(logical(applied.snapshot.blocks)).toBe(logical(expected));
 });
});

describe('settings example follows the same linebreak rules',()=>{
 it('updates sentence grouping, long-sentence mode and blank-line count',async()=>{
  root=createRoot(host);const rules={...defaultDatabase().settings.rules,longLength:120};
  await act(async()=>root!.render(<BreakExample rules={rules}/>));
  expect(host.querySelector('.break-preview-copy')!.textContent).toBe('주말에는 아이와 함께 숲길을 걸었어요. \n\n바람이 선선해서 산책하기 좋았고, 중간에 쉬어 갈 벤치도 많았어요.');
  await act(async()=>root!.render(<BreakExample rules={{...rules,sentences:2}}/>));expect(host.querySelector('.break-preview-copy')!.textContent).not.toContain('\n');
  await act(async()=>root!.render(<BreakExample rules={{...rules,blankLines:2}}/>));expect(host.querySelector('.break-preview-copy')!.textContent).toContain('\n\n\n');
  await act(async()=>root!.render(<BreakExample rules={{...rules,longMode:'length',longLength:10,blankLines:0}}/>));expect(host.querySelector('.break-preview-copy')!.textContent).toContain('주말에는 아이와 \n함께');
 });
});

it('continues whole-body wrapping after native rerender replaces paragraph DOM nodes',async()=>{
 const editor=nativeEditor(true),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:1});
 const result=await editor.handle({type:'linebreak',plan});expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)return;
 expect(logical(result.snapshot.blocks)).toBe(logical(before.blocks.map(block=>({...block,text:text(plan.changes.find(c=>c.blockId===block.id)?.paragraphAfter??block.runs)}))));
 expect(await editor.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});
});

it('rolls back an incorrect split immediately instead of continuing the remaining body',async()=>{
 const editor=nativeEditor(),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:1});
 const original=vi.mocked(PublicEditorUI.prototype.insertParagraph).getMockImplementation()!;
 const insert=vi.spyOn(PublicEditorUI.prototype,'insertParagraph').mockImplementation(async function(this:PublicEditorUI,...args){
  const current=editor.reader.read(),selection=current.selection!,range=editor.reader.rangeAt(selection.blockId,selection.start+1);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);await original.apply(this,args);
 });
 const result=await editor.handle({type:'linebreak',plan});expect(result).toMatchObject({ok:false,error:expect.stringContaining('작업 전 상태로 복원')});expect(insert).toHaveBeenCalledOnce();expect((await editor.snapshot()).revision).toBe(before.revision);
});
it('refuses duplicate native paragraph IDs rather than guessing a target by its text',async()=>{
 const editor=nativeEditor(true),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:0});
 const original=vi.mocked(PublicEditorUI.prototype.insertParagraph).getMockImplementation()!;
 vi.spyOn(PublicEditorUI.prototype,'insertParagraph').mockImplementation(async function(this:PublicEditorUI,...args){await original.apply(this,args);const target=document.querySelectorAll('.se-text-paragraph')[1];target.after(target.cloneNode(true));});
 const result=await editor.handle({type:'linebreak',plan});expect(result).toMatchObject({ok:false,error:expect.stringContaining('문단')});expect((await editor.snapshot()).revision).toBe(before.revision);
});
it('preserves user edits when trusted typing interrupts a partially applied body operation',async()=>{
 const editor=nativeEditor(),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:1});
 const add=vi.spyOn(document,'addEventListener'),original=vi.mocked(PublicEditorUI.prototype.insertParagraph).getMockImplementation()!;
 vi.spyOn(PublicEditorUI.prototype,'insertParagraph').mockImplementation(async function(this:PublicEditorUI,...args){
  await original.apply(this,args);const p=document.createElement('p');p.className='se-text-paragraph';p.textContent='작업 중 사용자가 새로 쓴 문장';document.querySelector('[contenteditable]')!.append(p);
  const listener=add.mock.calls.find(([type])=>type==='keydown')![1] as EventListener;listener({isTrusted:true} as Event);
 });
 const undo=vi.mocked(PublicEditorUI.prototype.undo),result=await editor.handle({type:'linebreak',plan});expect(result).toMatchObject({ok:false,recoveryRequired:true,error:expect.stringContaining('직접 편집')});expect(undo).not.toHaveBeenCalled();expect(document.body.textContent).toContain('작업 중 사용자가 새로 쓴 문장');expect((await editor.snapshot()).issue).toContain('직접 편집');
});
it('does not auto-undo when the latest native Enter may still complete later',async()=>{
 const editor=nativeEditor(),before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:1});
 const original=vi.mocked(PublicEditorUI.prototype.insertParagraph).getMockImplementation()!;
 vi.spyOn(PublicEditorUI.prototype,'insertParagraph').mockImplementation(async function(this:PublicEditorUI,...args){await original.apply(this,args);throw new PendingNativeLinebreakError('문단 나누기 완료 확인 대기');});
 const result=await editor.handle({type:'linebreak',plan});expect(result).toMatchObject({ok:false,recoveryRequired:true,error:expect.stringContaining('완료 확인 대기')});expect(PublicEditorUI.prototype.undo).not.toHaveBeenCalled();expect((await editor.snapshot()).issue).toContain('완료 확인 대기');
});

it('wraps repeated paragraphs across a longer body while preserving excluded content',async()=>{
 const editor=nativeEditor(true),body=document.querySelector('[contenteditable]')!;body.replaceChildren();
 for(let i=0;i<20;i++){
  const p=document.createElement('p');p.id='SE-'+crypto.randomUUID();p.className='se-text-paragraph';p.innerHTML='같은 문장도 정확하게 나눠야 합니다. <b>굵은 글자와 기존 줄</b><br>수동 줄바꿈 뒤에도 문장이 있습니다. 다음 문장입니다.';body.append(p);
  if(i===8)body.insertAdjacentHTML('beforeend','<p class="se-text-paragraph" data-paragraph-style="heading">보호할 소제목</p><blockquote><p class="se-text-paragraph">보호할 인용문입니다. 줄을 나누지 않습니다.</p></blockquote><div class="se-component se-image" id="protected-photo"><img class="se-image-resource" src="https://example.test/image.png"><div class="se-caption">보호할 사진 설명</div></div>');
 }
 const before=await editor.snapshot(),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,scope:'body',longMode:'length',longLength:24,blankLines:1});expect(plan.changes).toHaveLength(20);
 const result=await editor.handle({type:'linebreak',plan});expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)return;
 const expected=before.blocks.map(block=>({...block,text:text(plan.changes.find(c=>c.blockId===block.id)?.paragraphAfter??block.runs)}));expect(logical(result.snapshot.blocks.filter(b=>b.kind!=='photo'))).toBe(logical(expected.filter(b=>b.kind!=='photo')));
 expect(result.snapshot.blocks.find(b=>b.kind==='photo')?.photo).toEqual(before.blocks.find(b=>b.kind==='photo')?.photo);expect(result.snapshot.blocks.find(b=>b.kind==='quote')?.text).toBe('보호할 인용문입니다. 줄을 나누지 않습니다.');
 expect(await editor.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});
},20000);
