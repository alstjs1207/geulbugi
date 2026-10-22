// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {EditorReader} from '../src/editor/reader';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';
import {verifyPostconditions} from '../src/editor/postconditions';
import {buildBreakPlan} from '../src/core/linebreak';

let adapters:NativeAdapter[]=[];
let readers:EditorReader[]=[];
const preset={id:'audit-bold',name:'굵게',description:'',format:{bold:true}};
const selectedSpan=()=>document.querySelector<HTMLElement>('p span')!;
const content=()=>document.querySelector<HTMLElement>('.se-main-container')!;
beforeEach(async()=>{
 vi.useFakeTimers();
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 document.body.style.color='#000000';document.title='';
 document.body.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span style="color:#00b976">원래 본문입니다.</span></p></div></div></div>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:30,x:0,y:0,top:0,left:0,right:100,bottom:30,toJSON:()=>({})});
 await saveDatabase(defaultDatabase());
});
afterEach(()=>{adapters.forEach(a=>a.reader.dispose());readers.forEach(r=>r.dispose());adapters=[];readers=[];vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();document.body.innerHTML='';document.body.style.color='';});
function adapter(){
 const a=new NativeAdapter();adapters.push(a);const range=document.createRange();range.selectNodeContents(selectedSpan());window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);a.reader.captureSelection();return a;
}
async function finish<T>(pending:Promise<T>,ms=500){await vi.advanceTimersByTimeAsync(ms);return pending;}
function boldButton(delay=0){
 const b=document.createElement('button');b.setAttribute('aria-label','굵기 적용');document.body.append(b);
 b.addEventListener('click',()=>{const apply=()=>{selectedSpan().style.fontWeight=selectedSpan().style.fontWeight==='700'?'400':'700';};if(delay)setTimeout(apply,delay);else apply();});return b;
}

it('fix 1: waits for delayed native undo and preserves earlier formatting',async()=>{
 const a=adapter(),before=await a.snapshot(),originalWeight=selectedSpan().style.fontWeight;
 vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){selectedSpan().style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
 expect(await finish(a.handle({type:'format',preset}))).toMatchObject({ok:true});
 let dispatched=0;
 const undo=document.createElement('button');undo.setAttribute('aria-label','실행 취소');document.body.append(undo);
 undo.addEventListener('click',()=>{const step=++dispatched;setTimeout(()=>{selectedSpan().style.fontWeight=originalWeight;if(step>=2)selectedSpan().style.color='#333333';},250);});
 const result=await finish(a.handle({type:'undo'}),700);
 expect(result).toMatchObject({ok:true});expect(dispatched).toBe(1);
 await vi.advanceTimersByTimeAsync(500);
 expect(selectedSpan().style.color).toBe('rgb(0, 185, 118)');expect((await a.snapshot()).revision).toBe(before.revision);
});

it('fix 2: reports success only after a delayed format settles',async()=>{
 const a=adapter();boldButton(450);
 const before=await a.snapshot(),result=await finish(a.handle({type:'format',preset}),900);
 expect(result).toMatchObject({ok:true});expect((await a.snapshot()).revision).not.toBe(before.revision);
 await vi.advanceTimersByTimeAsync(400);
 expect(selectedSpan().style.fontWeight).toBe('700');expect((await a.snapshot()).canUndo).toBe(true);expect((await a.snapshot()).issue).toBeUndefined();
});

it('fix 3: preserves user text when a multi-step format fails',async()=>{
 const a=adapter();boldButton();
 const beforeHtml=content().innerHTML,history:string[]=[];
 // The next color menu never becomes available; while the toolbar waits, the
 // author types, creating a separate native history entry after the bold step.
 const color=document.createElement('button');color.setAttribute('aria-label','글자색 변경');document.body.append(color);
 setTimeout(()=>{history.push(content().innerHTML);selectedSpan().textContent+=' 사용자가 방금 추가한 문장';},80);
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{content().innerHTML=history.length?history.pop()!:beforeHtml;return true;});
 const result=await finish(a.handle({type:'format',preset:{...preset,format:{bold:true,color:'#00b976'}}}),3000);
 expect(result).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();expect(document.body.textContent).toContain('사용자가 방금 추가한 문장');
});

it('fix 4: rejects lost spaces in an untouched paragraph',async()=>{
 selectedSpan().textContent='첫 문장입니다. 다음 문장입니다.';
 const a=adapter();content().querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<p class="se-text-paragraph"><span>아이와 함께 산책해요.</span></p>');
 const before=await a.snapshot(),after=structuredClone(before),plan=buildBreakPlan(before,{...defaultDatabase().settings.rules,longLength:120});expect(plan.changes).toHaveLength(1);
 after.blocks[0].runs=structuredClone(plan.changes[0].after);after.blocks[0].text=after.blocks[0].runs.map(run=>run.text).join('');
 after.blocks[1].runs[0].text='아이와함께산책해요.';after.blocks[1].text=after.blocks[1].runs[0].text;
 expect(()=>verifyPostconditions(before,after,{type:'linebreak',plan})).toThrow(/보존|줄바꿈/);
});

it('fix 5: completes a delayed photo AI toggle once and rejects a duplicate while busy',async()=>{
 content().querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image" id="SE-audit-photo"><div class="se-module-image"><img class="se-image-resource" src="https://example.test/photo.png"><button class="se-set-ai-mark-button-toggle"></button></div></div>');
 const button=document.querySelector<HTMLButtonElement>('.se-set-ai-mark-button-toggle')!;let clicks=0;button.addEventListener('click',()=>{clicks++;setTimeout(()=>button.classList.toggle('se-is-selected'),1800);});
 const a=adapter(),before=await a.snapshot(),request=(snapshot:typeof before)=>({type:'photo-ai-on' as const,expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}});
 const pending=a.handle(request(before));await vi.advanceTimersByTimeAsync(1600);expect(await a.handle(request(await a.snapshot()))).toMatchObject({ok:false});
 await vi.advanceTimersByTimeAsync(600);expect(await pending).toMatchObject({ok:true});expect(button.classList.contains('se-is-selected')).toBe(true);expect(clicks).toBe(1);await vi.advanceTimersByTimeAsync(1700);expect(button.classList.contains('se-is-selected')).toBe(true);
});

it('fix 6: waits for delayed reservation mode and applies the requested date/time',async()=>{
 document.body.insertAdjacentHTML('beforeend','<div class="layer_content_set_publish__audit"><input id="audit-now" name="radio_time" type="radio" value="now" checked><label for="audit-now">현재</label><input id="audit-pre" name="radio_time" type="radio" value="pre"><label for="audit-pre">예약</label><input class="input_date__audit" value="2026. 11. 02"><select title="예약 발행 시간 선택"><option>10</option><option>09</option></select><select title="예약 발행 분 선택"><option>00</option><option>40</option></select></div>');
 const now=document.getElementById('audit-now') as HTMLInputElement,pre=document.getElementById('audit-pre') as HTMLInputElement;
 document.querySelector('label[for="audit-pre"]')!.addEventListener('click',event=>{event.preventDefault();setTimeout(()=>{now.checked=false;pre.checked=true;},2500);});
 const a=adapter(),before=await a.snapshot(),result=await finish(a.handle({type:'publish-time',value:{mode:'scheduled',date:'2026-11-02',time:'09:40'},expected:{sessionId:before.sessionId,documentKey:before.documentKey,revision:before.revision}}),3200);
 expect(result).toMatchObject({ok:true});expect(now.checked).toBe(false);
 await vi.advanceTimersByTimeAsync(1000);expect(pre.checked).toBe(true);expect((await a.snapshot()).publishTime).toMatchObject({mode:'scheduled',time:'09:40'});expect((await a.snapshot()).issue).toBeUndefined();
});

it('blocks retry of a photo AI toggle that remains unconfirmed after its deadline',async()=>{
 content().querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<div class="se-component se-image" id="SE-audit-photo"><div class="se-module-image"><img class="se-image-resource" src="https://example.test/photo.png"><button class="se-set-ai-mark-button-toggle"></button></div></div>');
 const button=document.querySelector<HTMLButtonElement>('.se-set-ai-mark-button-toggle')!;let clicks=0;
 button.addEventListener('click',()=>{clicks++;setTimeout(()=>button.classList.toggle('se-is-selected'),6000);});
 const a=adapter(),before=await a.snapshot(),request=(snapshot:typeof before)=>({type:'photo-ai-on' as const,expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}});
 const first=await finish(a.handle(request(before)),4200);expect(first).toMatchObject({ok:false,recoveryRequired:true});expect(button.classList.contains('se-is-selected')).toBe(false);expect((first as {recoveryRequired?:boolean}).recoveryRequired).toBe(true);
 const second=await finish(a.handle(request(await a.snapshot())),400);expect(second).toMatchObject({ok:false,recoveryRequired:true});expect(button.classList.contains('se-is-selected')).toBe(false);expect(clicks).toBe(1);
 await vi.advanceTimersByTimeAsync(2200);expect(button.classList.contains('se-is-selected')).toBe(true);
});

it('does not claim restoration or permit retry of an unconfirmed reservation change',async()=>{
 document.body.insertAdjacentHTML('beforeend','<div class="layer_content_set_publish__audit"><input id="audit-now" name="radio_time" type="radio" value="now" checked><label for="audit-now">현재</label><input id="audit-pre" name="radio_time" type="radio" value="pre"><label for="audit-pre">예약</label><input class="input_date__audit" value="2026. 11. 02"><select title="예약 발행 시간 선택"><option>10</option></select><select title="예약 발행 분 선택"><option>00</option></select></div>');
 const now=document.getElementById('audit-now') as HTMLInputElement,pre=document.getElementById('audit-pre') as HTMLInputElement;
 document.querySelector('label[for="audit-pre"]')!.addEventListener('click',event=>{event.preventDefault();setTimeout(()=>{now.checked=false;pre.checked=true;},6000);});
 const a=adapter(),before=await a.snapshot(),result=await finish(a.handle({type:'publish-time',value:{mode:'scheduled',date:'2026-11-02',time:'09:40'},expected:{sessionId:before.sessionId,documentKey:before.documentKey,revision:before.revision}}),4200);
 expect(result).toMatchObject({ok:false,recoveryRequired:true});if(!result.ok)expect(result.error).not.toContain('원래대로 돌렸어요');expect(now.checked).toBe(true);
 await vi.advanceTimersByTimeAsync(2200);expect(pre.checked).toBe(true);expect((await a.snapshot()).publishTime).toMatchObject({mode:'scheduled',time:'10:00'});expect((await a.snapshot()).issue).toBeTruthy();
 const blocked=await finish(a.handle({type:'publish-time',value:{mode:'now'},expected:{sessionId:before.sessionId,documentKey:before.documentKey,revision:before.revision}}),100);expect(blocked).toMatchObject({ok:false,recoveryRequired:true});
});

it('blocks repeat undo while the first unconfirmed native undo can still finish',async()=>{
 const a=adapter(),before=await a.snapshot();
 vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){selectedSpan().style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
 await finish(a.handle({type:'format',preset}));let clicks=0;const undo=document.createElement('button');undo.setAttribute('aria-label','실행 취소');document.body.append(undo);
 undo.addEventListener('click',()=>{clicks++;setTimeout(()=>{selectedSpan().style.fontWeight='';},2600);});
 const result=await finish(a.handle({type:'undo'}),2300);expect(result).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).toBe(1);
 expect(await finish(a.handle({type:'undo'}),100)).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).toBe(1);
 await vi.advanceTimersByTimeAsync(600);expect((await a.snapshot()).revision).toBe(before.revision);expect(selectedSpan().style.color).toBe('rgb(0, 185, 118)');
});
it('locks an unconfirmed format rather than dispatching a second toggle',async()=>{
 const a=adapter(),b=boldButton(2600),clicks=vi.fn();b.addEventListener('click',clicks);
 const result=await finish(a.handle({type:'format',preset}),2300);expect(result).toMatchObject({ok:false,recoveryRequired:true});
 expect(await finish(a.handle({type:'format',preset}),100)).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(800);expect(selectedSpan().style.fontWeight).toBe('700');
});
it('redoes a coalesced undo that would remove an unchanged earlier color',async()=>{
 const a=adapter();vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){selectedSpan().style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
 await finish(a.handle({type:'format',preset}));
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{selectedSpan().style.fontWeight='';selectedSpan().style.color='#333333';return true;});
 const redo=vi.spyOn(PublicEditorUI.prototype,'redo').mockImplementation(async()=>{selectedSpan().style.fontWeight='700';selectedSpan().style.color='#00b976';return true;});
 expect(await finish(a.handle({type:'undo'}))).toMatchObject({ok:false,recoveryRequired:true});expect(undo).toHaveBeenCalledOnce();expect(redo).toHaveBeenCalledOnce();expect(selectedSpan().style.color).toBe('rgb(0, 185, 118)');
});
it('stops on trusted input in the native input frame and preserves replacement text',async()=>{
 const frame=document.createElement('iframe');frame.id='input_buffer_audit';document.body.append(frame);const doc=frame.contentDocument!;doc.body.setAttribute('contenteditable','true');doc.body.innerHTML='<span data-input-buffer="test"></span>';
 const a=adapter(),add=vi.spyOn(doc,'addEventListener');
 vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){selectedSpan().style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();selectedSpan().textContent='사용자가 직접 바꾼 문장';const listener=add.mock.calls.find(([type])=>type==='keydown')![1] as EventListener;listener({isTrusted:true} as Event);throw new Error('후속 도구 실패');});
 const undo=vi.spyOn(PublicEditorUI.prototype,'undo');expect(await finish(a.handle({type:'format',preset}))).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();expect(selectedSpan().textContent).toBe('사용자가 직접 바꾼 문장');
});
it('does not create a pending operation for already-matching font size in a compound format',async()=>{
 selectedSpan().style.fontSize='16px';const a=adapter();boldButton();
 expect(await finish(a.handle({type:'format',preset:{...preset,format:{fontSize:16,bold:true}}}),1000)).toMatchObject({ok:true});
});

it('returns protected failure if the automatic rollback itself remains pending',async()=>{
 const a=adapter();boldButton();const color=document.createElement('button');color.setAttribute('aria-label','글자색 변경');document.body.append(color);
 let clicks=0;const undo=document.createElement('button');undo.setAttribute('aria-label','실행 취소');document.body.append(undo);undo.addEventListener('click',()=>{clicks++;setTimeout(()=>{selectedSpan().style.fontWeight='';},2600);});
 const result=await finish(a.handle({type:'format',preset:{...preset,format:{bold:true,color:'#333333'}}}),4500);expect(result).toMatchObject({ok:false,recoveryRequired:true});expect(clicks).toBe(1);
 await vi.advanceTimersByTimeAsync(1000);expect(selectedSpan().style.color).toBe('rgb(0, 185, 118)');expect(clicks).toBe(1);
});
it('preserves deferred user additions when the original text includes emoji',async()=>{
 selectedSpan().textContent='🌳 아이와 함께 산책해요.';const a=adapter();boldButton();const color=document.createElement('button');color.setAttribute('aria-label','글자색 변경');document.body.append(color);
 setTimeout(()=>{selectedSpan().textContent+=' 새로 쓴 문장';},80);const undo=vi.spyOn(PublicEditorUI.prototype,'undo');
 expect(await finish(a.handle({type:'format',preset:{...preset,format:{bold:true,color:'#00b976'}}}),1000)).toMatchObject({ok:false,recoveryRequired:true});expect(undo).not.toHaveBeenCalled();expect(selectedSpan().textContent).toContain('새로 쓴 문장');
});
it('rejects space movement between untouched paragraphs during a format',async()=>{
 content().querySelector('[contenteditable]')!.insertAdjacentHTML('beforeend','<p class="se-text-paragraph"><span>둘째 문단 </span></p><p class="se-text-paragraph"><span>셋째 문단</span></p>');
 const a=adapter(),before=await a.snapshot(),after=structuredClone(before);after.blocks[0].runs=after.blocks[0].runs.map(run=>({...run,marks:{...run.marks,bold:true}}));
 after.blocks[1].runs[0].text='둘째 문단';after.blocks[2].runs[0].text=' 셋째 문단';
 expect(()=>verifyPostconditions(before,after,{type:'format',preset})).toThrow(/공백|보존/);
});

it('waits for delayed quotation conversion before restoring its glyph formatting',async()=>{
 const a=adapter(),convert=document.createElement('button');convert.setAttribute('aria-label','인용구로 변경');document.body.append(convert);
 convert.addEventListener('click',()=>setTimeout(()=>{document.querySelector('p')!.outerHTML='<blockquote><p class="se-text-paragraph"><span style="color:#00b976">원래 본문입니다.</span></p></blockquote>';},450));
 const result=await finish(a.handle({type:'format',preset:{id:'late-quote',name:'인용구',description:'',format:{paragraphStyle:'quote',quoteStyle:'default'}}}),1200);
 expect(result).toMatchObject({ok:true});if(result.ok){expect(result.snapshot.blocks[0].kind).toBe('quote');expect(result.snapshot.blocks[0].text).toBe('원래 본문입니다.');expect(result.snapshot.canUndo).toBe(true);}
});
