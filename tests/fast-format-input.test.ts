// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';
import type {Preset} from '../src/core/types';
let adapter:NativeAdapter,events:ReturnType<typeof vi.spyOn>;
const preset:Preset={id:'fast-bold',name:'굵게',description:'',format:{bold:true}};
const span=()=>document.querySelector<HTMLElement>('p span')!;
beforeEach(async()=>{
 vi.useFakeTimers();const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 document.title='';document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span>서식 대상 원문입니다.</span></p><p class="se-text-paragraph"><span>선택 밖 원문입니다.</span></p></div></div></div><button aria-label="굵기 적용">굵게</button>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
 await saveDatabase(defaultDatabase());adapter=new NativeAdapter();const range=document.createRange();range.selectNodeContents(span());window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);adapter.reader.captureSelection();
 events=vi.spyOn(document,'addEventListener');
});
afterEach(()=>{adapter.reader.dispose();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();document.body.innerHTML='';});
function bold(delay=0){document.querySelector('button')!.addEventListener('click',()=>{const apply=()=>{span().style.fontWeight=span().style.fontWeight==='700'?'400':'700';};if(delay)setTimeout(apply,delay);else apply();});}
function input(type='keydown',key='a'){
 const handler=events.mock.calls.find((call:unknown[])=>call[0]===type&&call[2]===true)?.[1] as EventListener;
 handler({isTrusted:true,type,key} as unknown as Event);
}

it.each(['keydown','compositionstart','paste'])('hands off a fully applied native format before %s and preserves the new text',async type=>{
 bold();const undo=vi.spyOn(PublicEditorUI.prototype,'undo'),pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);
 input(type);span().append(' 작성한 새 글');await vi.advanceTimersByTimeAsync(50);
 expect(await pending).toMatchObject({ok:true,snapshot:{canUndo:false}});expect((await adapter.snapshot()).issue).toBeUndefined();expect(span().textContent).toContain('작성한 새 글');expect(undo).not.toHaveBeenCalled();
 expect(await adapter.handle({type:'undo'})).toMatchObject({ok:false});expect(span().textContent).toContain('작성한 새 글');
});

it('captures the current selection when a format request beats the delayed selection event',async()=>{
 bold();window.getSelection()!.collapseToStart();adapter.reader.captureSelection();expect(adapter.reader.read().selection?.collapsed).toBe(true);
 const range=document.createRange();range.selectNodeContents(span());window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(300);
 expect(await pending).toMatchObject({ok:true,snapshot:{canUndo:true}});expect(span().style.fontWeight).toBe('700');
});

it('accepts a next format at 40ms only after verifying the previous native result',async()=>{
 bold();const first=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(40);
 const second=adapter.handle({type:'format',preset:{...preset,format:{bold:false}}});await vi.advanceTimersByTimeAsync(300);
 expect(await first).toMatchObject({ok:true});expect(await second).toMatchObject({ok:true,snapshot:{canUndo:true}});expect(span().style.fontWeight).toBe('400');
 expect(document.querySelectorAll('p span')[1].textContent).toBe('선택 밖 원문입니다.');expect((await adapter.snapshot()).issue).toBeUndefined();
});

it.each(['ArrowRight','End'])('permits %s followed by immediate typing after the native format is fully verified',async key=>{
 bold();const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);input('keydown',key);
 window.getSelection()!.collapseToEnd();span().append(' 바로 작성');await vi.advanceTimersByTimeAsync(60);
 expect(await pending).toMatchObject({ok:true,snapshot:{canUndo:false}});expect((await adapter.snapshot()).issue).toBeUndefined();expect(span().textContent).toContain('바로 작성');
});

it('does not execute the next format if its frozen target changes during handoff',async()=>{
 bold();const first=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);
 const second=adapter.handle({type:'format',preset:{...preset,format:{bold:false}}});span().append(' 직접 입력');await vi.advanceTimersByTimeAsync(200);
 expect(await first).toMatchObject({ok:true});expect(await second).toMatchObject({ok:false,error:expect.stringContaining('다시 선택')});expect(span().style.fontWeight).toBe('700');expect(span().textContent).toContain('직접 입력');
});

it('keeps a delayed unconfirmed native action protected when typing starts',async()=>{
 bold(450);const undo=vi.spyOn(PublicEditorUI.prototype,'undo'),pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);
 input();span().append(' 새 입력');await vi.advanceTimersByTimeAsync(100);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();expect(span().textContent).toContain('새 입력');
});

it('does not treat a partial compound format as complete before typing',async()=>{
 bold();const menu=document.createElement('button');menu.setAttribute('aria-label','글자색 변경');const clicks=vi.fn();menu.addEventListener('click',clicks);document.body.append(menu);
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo'),pending=adapter.handle({type:'format',preset:{...preset,format:{bold:true,color:'#00b976'}}});await vi.advanceTimersByTimeAsync(20);
 input();span().append(' 새 입력');await vi.advanceTimersByTimeAsync(100);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).not.toHaveBeenCalled();expect(undo).not.toHaveBeenCalled();expect(span().textContent).toContain('새 입력');
});

it.each(['title','photo','outside style'])('requires recovery when %s changed before the input checkpoint',async changed=>{
 bold();const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);
 if(changed==='title')document.title='바뀐 제목';
 if(changed==='photo')document.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img src="https://example.test/photo.png"></div>');
 if(changed==='outside style')(document.querySelectorAll('p span')[1] as HTMLElement).style.fontWeight='700';
 input();span().append(' 새 입력');await vi.advanceTimersByTimeAsync(100);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(span().textContent).toContain('새 입력');
});
