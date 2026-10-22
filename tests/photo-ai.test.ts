// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {enablePhotoAi} from '../src/editor/photo-ai';
import {photoAiContent,photoAiStatus} from '../src/core/photo-ai';
import type {Snapshot} from '../src/core/types';

let adapter:NativeAdapter,clicks:number[];
const toggle=(i:number)=>document.querySelectorAll<HTMLButtonElement>('.se-set-ai-mark-button-toggle')[i];
function module(i:number,on=false){return `<div class="se-module-image"><img class="se-image-resource" src="https://example.test/${i}.png" alt="사진 ${i}"><div class="se-set-ai-mark-button-wrapper"><div class="se-set-ai-mark-button"><p>AI 활용 설정</p><button class="se-set-ai-mark-button-toggle ${on?'se-is-selected':''}"></button></div></div></div>`;}
function request(snapshot:Snapshot){return {type:'photo-ai-on' as const,expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}};}
beforeEach(()=>{
 document.body.innerHTML=`<div class="se-editor"><div class="se-main-container"><div class="se-component se-text"><p class="se-text-paragraph" contenteditable="true"><b>보존할 본문</b><a href="https://example.test/">링크</a></p></div><div class="se-component se-image">${module(0,true)}<div class="se-caption"><p class="se-text-paragraph">보존할 캡션</p></div></div><div class="se-component se-imageGroup se-l-collage">${module(1)}${module(2)}</div></div></div>`;
 clicks=[];document.querySelectorAll<HTMLButtonElement>('.se-set-ai-mark-button-toggle').forEach((b,i)=>b.addEventListener('click',()=>{clicks.push(i);b.classList.toggle('se-is-selected');}));
 adapter=new NativeAdapter();
});
afterEach(()=>{adapter.reader.dispose();vi.restoreAllMocks();vi.useRealTimers();document.body.innerHTML='';});

describe('bulk native photo AI labels',()=>{
 it('reads individual and grouped labels and includes manual changes in the revision',async()=>{
  const before=await adapter.snapshot();expect(photoAiStatus(before.blocks)).toEqual({total:3,on:1,unknown:0});
  expect(before.capabilities).toContain('photo-ai-on');
  toggle(1).click();const after=await adapter.snapshot();expect(after.revision).not.toBe(before.revision);expect(photoAiContent(after)).toBe(photoAiContent(before));
  expect(after.blocks.find(b=>b.kind==='photo')?.photo?.caption).toBe('보존할 캡션');
 });
 it('turns on only OFF images including every item in a group without a selection',async()=>{
  const before=await adapter.snapshot(),result=await adapter.handle(request(before));
  expect(result).toMatchObject({ok:true,snapshot:{canUndo:true}});expect(clicks).toEqual([1,2]);
  if(!result.ok)throw new Error(result.error);
  expect(photoAiStatus(result.snapshot.blocks)).toEqual({total:3,on:3,unknown:0});
  expect(photoAiContent(result.snapshot)).toBe(photoAiContent(before));expect(result.snapshot.selection).toBeNull();
 });
 it('supports the live collage/slide control shared by the entire group and clicks it only once',async()=>{
  const group=document.querySelector('.se-imageGroup')!,control=toggle(1);
  group.querySelectorAll('.se-set-ai-mark-button-wrapper').forEach(e=>e.remove());group.append(control);
  const before=await adapter.snapshot();expect(photoAiStatus(before.blocks)).toEqual({total:3,on:1,unknown:0});
  const result=await adapter.handle(request(before));expect(result).toMatchObject({ok:true});expect(clicks).toEqual([1]);
  if(result.ok){expect(photoAiStatus(result.snapshot.blocks)).toEqual({total:3,on:3,unknown:0});expect(photoAiContent(result.snapshot)).toBe(photoAiContent(before));}
 });
 it('preflights every control before changing any photo when a later toggle is disabled',async()=>{
  toggle(2).disabled=true;expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false});expect(clicks).toEqual([]);
 });
 it('treats repeat requests as unchanged, preserves history and restores the exact mixed baseline with undo',async()=>{
  const before=await adapter.snapshot();
  await adapter.handle(request(before));const after=await adapter.snapshot();clicks=[];
  expect(await adapter.handle(request(after))).toMatchObject({ok:true,unchanged:true,snapshot:{canUndo:true}});expect(clicks).toEqual([]);
  const keyboardUndo=vi.spyOn(PublicEditorUI.prototype,'undo').mockRejectedValue(new Error('AI labels must not consume native caption history'));
  expect(await adapter.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision,canUndo:false}});
  expect(keyboardUndo).not.toHaveBeenCalled();expect(photoAiContent(await adapter.snapshot())).toBe(photoAiContent(before));
  expect((await adapter.snapshot()).issue).toBeUndefined();
 });
 it('allows another batch after undo while preserving a caption edited immediately before the batch',async()=>{
  document.querySelector('.se-caption p')!.textContent='직전에 직접 편집한 캡션';
  const before=await adapter.snapshot();await adapter.handle(request(before));
  expect(await adapter.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});
  expect(document.querySelector('.se-caption p')!.textContent).toBe('직전에 직접 편집한 캡션');
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:true});
 });
 it('leaves the current document intact when AI restoration becomes unavailable without locking future editing',async()=>{
  await adapter.handle(request(await adapter.snapshot()));toggle(2).disabled=true;
  const keyboardUndo=vi.spyOn(PublicEditorUI.prototype,'undo');
  expect(await adapter.handle({type:'undo'})).toMatchObject({ok:false});expect(keyboardUndo).not.toHaveBeenCalled();
  expect(photoAiStatus((await adapter.snapshot()).blocks).on).toBe(3);expect((await adapter.snapshot()).issue).toBeUndefined();
  toggle(2).disabled=false;expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:true,unchanged:true});
 });
 it.each(['sessionId','documentKey','revision'] as const)('rejects a stale %s before any toggle',async field=>{
  const before=await adapter.snapshot(),r=request(before);r.expected[field]='stale';
  expect(await adapter.handle(r)).toMatchObject({ok:false,error:expect.stringContaining('바뀌었어요')});expect(clicks).toEqual([]);
 });
 it('rejects a missing control before changing any photo',async()=>{
  toggle(2).remove();const before=await adapter.snapshot();
  expect(photoAiStatus(before.blocks).unknown).toBe(1);expect(await adapter.handle(request(before))).toMatchObject({ok:false});expect(clicks).toEqual([]);
 });
 it('rejects duplicated controls rather than guessing their state',async()=>{
  toggle(2).parentElement!.append(toggle(2).cloneNode());const before=await adapter.snapshot();
  expect(photoAiStatus(before.blocks).unknown).toBe(1);expect(await adapter.handle(request(before))).toMatchObject({ok:false});expect(clicks).toEqual([]);
 });
 it('reports partial completion and blocks retry of an unconfirmed control',async()=>{
  const off=toggle(2),block=(event:Event)=>{event.stopImmediatePropagation();};off.addEventListener('click',block,true);
  vi.useFakeTimers();const before=await adapter.snapshot(),pending=adapter.handle(request(before));await vi.advanceTimersByTimeAsync(4200);
  expect(await pending).toMatchObject({ok:false,error:expect.stringContaining('3장 중 2장 ON')});expect(toggle(1).classList.contains('se-is-selected')).toBe(true);
  off.removeEventListener('click',block,true);clicks=[];const current=await adapter.snapshot(),retry=adapter.handle(request(current));await vi.advanceTimersByTimeAsync(200);
  expect(await retry).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).toEqual([]);
 });
 it('preserves user text edits and stops before the next photo',async()=>{
  toggle(1).addEventListener('click',()=>{document.querySelector('b')!.textContent='사용자가 바꾼 본문';});
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false,error:expect.stringContaining('바뀌었어요')});
  expect(document.querySelector('b')!.textContent).toBe('사용자가 바꾼 본문');expect(clicks).toEqual([1]);expect(toggle(2).classList.contains('se-is-selected')).toBe(false);
 });
 it('checks the interaction guard before clicking',async()=>{
  const guard=vi.fn(()=>{throw new Error('사용자 입력');});await expect(enablePhotoAi(adapter.reader,vi.fn(),guard)).rejects.toThrow('사용자 입력');expect(clicks).toEqual([]);
 });
 it('rejects a read-only document and an upload in progress',async()=>{
  document.querySelector('[contenteditable]')!.removeAttribute('contenteditable');
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false,error:expect.stringContaining('글쓰기')});
  document.querySelector('p')!.setAttribute('contenteditable','true');document.body.insertAdjacentHTML('beforeend','<div class="se-upload-progress"></div>');
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false,error:expect.stringContaining('업로드')});expect(clicks).toEqual([]);
 });
 it('edits only known AI toggles without requiring a hidden slide image source to load',async()=>{
  const read=adapter.reader.read.bind(adapter.reader);
  vi.spyOn(adapter.reader,'read').mockImplementation(()=>({...read(),mediaPending:true}));
  const load=vi.spyOn(adapter.reader,'loadPendingPhotos').mockRejectedValue(new Error('hidden slide'));
  await adapter.snapshot();await Promise.resolve();await Promise.resolve();
  const before=await adapter.snapshot();const result=await adapter.handle(request(before));expect(result).toMatchObject({ok:true});
  const calls=load.mock.calls.length;expect(await adapter.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});expect(load.mock.calls).toHaveLength(calls);
 });
 it('does not silently succeed when there are no photos',async()=>{
  document.querySelectorAll('.se-image,.se-imageGroup').forEach(e=>e.remove());
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false,error:expect.stringContaining('사진이 없어요')});
 });
 it('does not change text or toggle labels when an existing native popup is open',async()=>{
  document.body.insertAdjacentHTML('beforeend','<div class="se-popup">열려 있는 창</div>');vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({height:20} as DOMRect);
  expect(await adapter.handle(request(await adapter.snapshot()))).toMatchObject({ok:false,error:expect.stringContaining('창을 닫은')});expect(clicks).toEqual([]);
 });
 it('does not allow a manual AI change to be overwritten by an old undo request',async()=>{
  await adapter.handle(request(await adapter.snapshot()));toggle(0).click();
  expect((await adapter.snapshot()).canUndo).toBe(false);expect(await adapter.handle({type:'undo'})).toMatchObject({ok:false});
 });
});
