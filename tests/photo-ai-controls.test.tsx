// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PhotoAiControls} from '../src/ui/PhotoAiControls';
import type {Snapshot} from '../src/core/types';

let root:Root,host:HTMLDivElement;
const snapshot:Snapshot={sessionId:'test',documentKey:'draft',revision:'body',adapterSignature:'v38',capabilities:['photo-ai-on'],title:'',url:'',editable:true,selection:null,linkedUrls:[],uploadBusy:false,canUndo:false,blocks:[{id:'group',kind:'photo',text:'',runs:[],photo:{src:'https://example.test/a.png',alt:'',caption:'',groupSize:2,items:[{src:'https://example.test/a.png',alt:'',aiMarked:true},{src:'https://example.test/b.png',alt:'',aiMarked:false}]}}]};
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=()=>host.querySelector<HTMLButtonElement>('button')!;
describe('photo AI panel',()=>{
 it('shows individual image counts and submits the current identity without a body selection',async()=>{
  const onApply=vi.fn().mockResolvedValue(true);await act(async()=>root.render(<PhotoAiControls snapshot={snapshot} busy={false} onApply={onApply}/>));
  expect(host.querySelector('[role=status]')!.textContent).toBe('1 / 2장 ON');expect(button().disabled).toBe(false);
  await act(async()=>button().click());expect(onApply).toHaveBeenCalledExactlyOnceWith({type:'photo-ai-on',expected:{sessionId:'test',documentKey:'draft',revision:'body'}},'사진 2장의 AI 활용 설정을 모두 켰어요.');
 });
 it.each([{uploadBusy:true},{mediaPreparing:true},{editable:false},{issue:'오류'}, {blocks:[]}, {capabilities:[]}, {blocks:[{...snapshot.blocks[0],photo:{...snapshot.blocks[0].photo!,items:undefined}}]}])('blocks unavailable or unverified editors %j',async overrides=>{
  const onApply=vi.fn();await act(async()=>root.render(<PhotoAiControls snapshot={{...snapshot,...overrides}} busy={false} onApply={onApply}/>));expect(button().disabled).toBe(true);await act(async()=>button().click());expect(onApply).not.toHaveBeenCalled();
 });
 it('guides reconnection for old content scripts',async()=>{
  const onReconnect=vi.fn();await act(async()=>root.render(<PhotoAiControls snapshot={{...snapshot,capabilities:undefined}} busy={false} onApply={vi.fn()} onReconnect={onReconnect}/>));
  expect(host.textContent).toContain('네이버 글쓰기 탭도 새로고침');await act(async()=>host.querySelector<HTMLButtonElement>('.text-btn')!.click());expect(onReconnect).toHaveBeenCalledOnce();
 });
 it('permits known AI toggles even when an offscreen slide image is not loaded',async()=>{
  const onApply=vi.fn().mockResolvedValue(true);await act(async()=>root.render(<PhotoAiControls snapshot={{...snapshot,mediaPending:true,mediaPreparing:false}} busy={false} onApply={onApply}/>));
  expect(button().disabled).toBe(false);await act(async()=>button().click());expect(onApply).toHaveBeenCalledOnce();
 });
 it('prevents repeated clicks during a request and unlocks after failure',async()=>{
  let finish!:(result:boolean)=>void;const onApply=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<PhotoAiControls snapshot={snapshot} busy={false} onApply={onApply}/>));
  await act(async()=>{button().click();button().click();});expect(onApply).toHaveBeenCalledOnce();expect(button().disabled).toBe(true);
  await act(async()=>finish(false));expect(button().disabled).toBe(false);expect(host.textContent).not.toContain('모두 켰어요');
 });
});
