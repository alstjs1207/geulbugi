// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';

const preset={id:'cursor-bold',name:'굵게',description:'',format:{bold:true}};
type ListenerSpy={mock:{calls:unknown[][]}};
let adapter:NativeAdapter;
const span=()=>document.querySelector<HTMLElement>('p span')!;
beforeEach(async()=>{
 vi.useFakeTimers();
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 document.title='';document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span>서식을 바꿀 문장</span></p><p class="se-text-paragraph"><span>커서를 옮길 문장</span></p></div></div></div>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
 await saveDatabase(defaultDatabase());adapter=new NativeAdapter();
 const range=document.createRange();range.selectNodeContents(span());window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);adapter.reader.captureSelection();
});
afterEach(()=>{adapter.reader.dispose();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();document.body.innerHTML='';});
function boldButton(delay=0){
 const button=document.createElement('button');button.setAttribute('aria-label','굵기 적용');document.body.append(button);
 button.addEventListener('click',()=>{const apply=()=>{span().style.fontWeight='700';};if(delay)setTimeout(apply,delay);else apply();});return button;
}
function trustedListener(add:ListenerSpy,type:string):EventListener{
 return add.mock.calls.find(([name,,capture])=>name===type&&capture===true)![1] as EventListener;
}
function moveCursor(add:ListenerSpy,type='mousedown'){
 // jsdom cannot manufacture trusted events. Invoke the installed capture
 // listener, then perform the browser's default caret movement separately.
 trustedListener(add,type)({isTrusted:true,type} as Event);
 const target=adapter.reader.read().blocks[1],range=adapter.reader.rangeAt(target.id,3);
 window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);adapter.reader.captureSelection();
 return target.id;
}

it.each([20,130])('completes verified formatting when the author clicks the body after %s ms',async delay=>{
 const add=vi.spyOn(document,'addEventListener'),button=boldButton(),clicks=vi.fn();button.addEventListener('click',clicks);
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo'),before=adapter.reader.read(),pending=adapter.handle({type:'format',preset});
 await vi.advanceTimersByTimeAsync(delay);const targetId=moveCursor(add);
 await vi.advanceTimersByTimeAsync(400);
 expect(await pending).toMatchObject({ok:true,snapshot:{canUndo:true}});
 expect(await adapter.snapshot()).toMatchObject({selection:{blockId:targetId,start:3,end:3,collapsed:true}});
 expect((await adapter.snapshot()).issue).toBeUndefined();expect(span().style.fontWeight).toBe('700');expect(clicks).toHaveBeenCalledOnce();expect(undo).not.toHaveBeenCalled();
 vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{span().style.fontWeight='';return true;});
 const reverting=adapter.handle({type:'undo'});await vi.advanceTimersByTimeAsync(400);
 expect(await reverting).toMatchObject({ok:true,snapshot:{revision:before.revision}});
});

it.each(['mousedown','touchstart'])('accepts a completed format followed by %s in the native input frame',async type=>{
 const frame=document.createElement('iframe');frame.id='input_buffer_cursor';document.body.append(frame);
 const add=vi.spyOn(frame.contentDocument!,'addEventListener');boldButton();
 const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);const targetId=moveCursor(add,type);
 await vi.advanceTimersByTimeAsync(400);
 expect(await pending).toMatchObject({ok:true,snapshot:{canUndo:true,selection:{blockId:targetId,start:3,collapsed:true}}});
 expect((await adapter.snapshot()).issue).toBeUndefined();
});

it('stops a compound format before applying its remaining tools at the new cursor',async()=>{
 const add=vi.spyOn(document,'addEventListener');boldButton();
 const color=document.createElement('button');color.setAttribute('aria-label','글자색 변경');document.body.append(color);const clicks=vi.fn();color.addEventListener('click',clicks);
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo');
 const pending=adapter.handle({type:'format',preset:{...preset,format:{bold:true,color:'#00b976'}}});
 await vi.advanceTimersByTimeAsync(20);moveCursor(add);await vi.advanceTimersByTimeAsync(400);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).not.toHaveBeenCalled();expect(undo).not.toHaveBeenCalled();
 expect(adapter.reader.read().blocks[1].runs[0].marks.bold).not.toBe(true);
});

it('keeps an unconfirmed native action protected when the click precedes its result',async()=>{
 const add=vi.spyOn(document,'addEventListener'),button=boldButton(450),clicks=vi.fn();button.addEventListener('click',clicks);const undo=vi.spyOn(PublicEditorUI.prototype,'undo');
 const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);moveCursor(add);await vi.advanceTimersByTimeAsync(100);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(500);expect(clicks).toHaveBeenCalledOnce();expect((await adapter.snapshot()).issue).toBeDefined();
});

it('preserves typing after a body click while the completed format is being checked',async()=>{
 const add=vi.spyOn(document,'addEventListener');boldButton();const undo=vi.spyOn(PublicEditorUI.prototype,'undo');
 const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);moveCursor(add);
 await vi.advanceTimersByTimeAsync(25);
 trustedListener(add,'keydown')({isTrusted:true,type:'keydown',key:'a'} as unknown as KeyboardEvent);
 document.querySelectorAll('p span')[1].textContent+=' 새로 입력한 글';await vi.advanceTimersByTimeAsync(400);
 expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();expect(document.body.textContent).toContain('새로 입력한 글');
});

it.each(['title','photo','unselected formatting'])('does not accept cursor movement when %s also changes',async changed=>{
 const add=vi.spyOn(document,'addEventListener');boldButton();const undo=vi.spyOn(PublicEditorUI.prototype,'undo');
 const pending=adapter.handle({type:'format',preset});await vi.advanceTimersByTimeAsync(20);moveCursor(add);
 if(changed==='title')document.title='바뀐 제목';
 if(changed==='photo')document.querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image"><img class="se-image-resource" src="https://example.test/photo.png"></div>');
 if(changed==='unselected formatting')(document.querySelectorAll('p span')[1] as HTMLElement).style.fontWeight='700';
 await vi.advanceTimersByTimeAsync(400);expect(await pending).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();
});
