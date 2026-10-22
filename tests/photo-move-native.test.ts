// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {EditorReader} from '../src/editor/reader';
import {PublicEditorUI} from '../src/editor/public-ui';
import {verifyPhotoMove} from '../src/editor/postconditions';
import {movedPhotoTarget} from '../src/core/photo-move';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';
import type {EditorRequest,Snapshot} from '../src/core/types';

type Move=Extract<EditorRequest,{type:'photo-move'}>;
let readers:EditorReader[]=[];
const BrowserMouseEvent=window.MouseEvent;
const box=(left=0,top=0,width=400,height=20)=>({left,top,right:left+width,bottom:top+height,x:left,y:top,width,height,toJSON:()=>({})}) as DOMRect;
const root=()=>document.querySelector<HTMLElement>('.se-components-wrap')!;
const target=()=>document.querySelector<HTMLElement>('#target')!;
const photo=()=>document.querySelector<HTMLElement>('.se-component.se-image,.se-component.se-imageGroup')!;
function instance(){const adapter=new NativeAdapter();readers.push(adapter.reader);return adapter;}
function request(snapshot:Snapshot,placement:'before'|'after'='before'):Move{return {type:'photo-move',photoId:snapshot.blocks.find(block=>block.kind==='photo')!.id,targetId:snapshot.blocks.find(block=>block.text==='대상 문단과 중요한 글자')!.id,placement};}

beforeEach(async()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 document.body.innerHTML='<div class="se-documentTitle"><p class="se-text-paragraph">사진 이동 검수</p></div><div class="se-dnd-wrap"><div class="se-canvas"><div class="se-components-wrap"><div class="se-component se-text"><p class="se-text-paragraph"><span>첫 문단</span></p><p id="target" class="se-text-paragraph"><span>대상 문단과 </span><strong>중요한 글자</strong></p><p class="se-text-paragraph"><span>마지막 문단</span></p></div><div id="photo" class="se-component se-image se-l-default"><div class="se-section se-section-image se-l-default"><div class="se-module se-module-image"><img class="se-image-resource" src="https://example.test/blue.png" width="600" alt="사진"><div class="se-caption"><p class="se-text-paragraph"><strong>보존할 캡션</strong></p></div></div></div></div></div></div></div><div class="se-selection"><svg class="se-caret se-caret-drop"></svg></div>';
 Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('se-selection')?box(0,0,400,500):this.closest('.se-component.se-image,.se-component.se-imageGroup')?box(20,300,200,100):box(0,100,400,20);});
 Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:function(this:Range){const node=this.startContainer,parent=node.nodeType===Node.TEXT_NODE?node.parentElement:node as Element,p=parent?.closest('p');if(!p||!p.textContent)return [];const prefix=document.createRange();prefix.selectNodeContents(p);prefix.setEnd(node,this.startOffset);return [box(20+prefix.toString().length*6,102,0,16)];}});
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>target().querySelector('span')});
 // jsdom's Window proxy is not accepted as MouseEventInit.view in Vitest.
 class NativeMouseEvent extends BrowserMouseEvent {constructor(type:string,init:MouseEventInit={}){const {view:_,...rest}=init;super(type,rest);}}
 class NativeDragEvent extends NativeMouseEvent {readonly dataTransfer:DataTransfer|null;constructor(type:string,init:DragEventInit={}){super(type,init);this.dataTransfer=init.dataTransfer??null;}}
 vi.stubGlobal('MouseEvent',NativeMouseEvent);Object.defineProperty(window,'MouseEvent',{configurable:true,value:NativeMouseEvent});
 vi.stubGlobal('DragEvent',NativeDragEvent);Object.defineProperty(window,'DragEvent',{configurable:true,value:NativeDragEvent});
 vi.stubGlobal('DataTransfer',class{});
 await saveDatabase(defaultDatabase());
});
afterEach(()=>{readers.forEach(reader=>reader.dispose());readers=[];vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();Object.defineProperty(window,'MouseEvent',{configurable:true,value:BrowserMouseEvent});delete (HTMLElement.prototype as unknown as Record<string,unknown>).scrollIntoView;delete (document as unknown as Record<string,unknown>).elementFromPoint;delete (document as unknown as Record<string,unknown>).elementsFromPoint;delete (Range.prototype as unknown as Record<string,unknown>).getClientRects;window.getSelection()?.removeAllRanges();document.body.innerHTML='';});

// This fixture models Naver's observed public DnD wrapper: dragstart opens a
// mouse gesture; mouseup emits drop+dragend; Escape cancels without a drop.
function nativeDnD(options:{wrongCaret?:boolean;partialGroup?:boolean;unitDragSplitsGroup?:boolean;onMove?:()=>void;commit?:(destination:HTMLElement,after:boolean)=>void}={}){
 const source=photo(),image=source.querySelector<HTMLElement>('img')!,wrapper=document.querySelector<HTMLElement>('.se-dnd-wrap')!,events:string[]=[],dispose:((()=>void))[]=[];
 let dragging=false,unitDrag=false;
 function listen(node:EventTarget,type:string,listener:EventListener,capture=false){node.addEventListener(type,listener,capture);dispose.push(()=>node.removeEventListener(type,listener,capture));}
 listen(image,'click',()=>{const section=image.closest('.se-section')!;if(!options.partialGroup)section.classList.add('se-is-selected');});
 listen(document,'mousedown',event=>{if((event.target as Element).closest('p')){source.querySelector('.se-section')!.classList.remove('se-is-selected');source.querySelectorAll('.se-module-image').forEach(module=>module.classList.remove('se-is-activated'));}});
 listen(source.querySelector('.se-section')!,'click',event=>{if(event.target===source.querySelector('.se-section')&&!options.partialGroup){source.querySelector('.se-section')!.classList.add('se-is-selected');source.querySelectorAll('.se-module-image').forEach(module=>module.classList.remove('se-is-activated'));}});
 listen(wrapper,'dragstart',event=>{event.preventDefault();dragging=true;unitDrag=!!options.unitDragSplitsGroup&&!!source.querySelector('.se-module-image.se-is-activated');events.push('dragstart');const ghost=document.createElement('div');ghost.className='se-dragging-ghost';document.body.append(ghost);});
 const finish=()=>{image.dispatchEvent(new DragEvent('dragend',{bubbles:true}));events.push('dragend');dragging=false;document.querySelector('.se-dragging-ghost')?.remove();};
 listen(wrapper,'mousemove',event=>{if(!dragging)return;events.push('mousemove');const mouse=event as MouseEvent,caret=document.querySelector<HTMLElement>('.se-caret-drop')!;caret.style.cssText='left:'+(mouse.clientX-.25+(options.wrongCaret?6:0))+'px;top:102px;height:16px;';options.onMove?.();},true);
 listen(document,'mouseup',event=>{if(!dragging)return;const mouse=event as MouseEvent,destination=(event.target as Element).closest<HTMLElement>('p')!,after=mouse.clientX>20+destination.textContent!.length*3;events.push('mouseup');destination.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));
  if(options.commit)options.commit(destination,after);else{const replacement=destination.cloneNode(true) as HTMLElement;destination.replaceWith(replacement);let moved=source;if(unitDrag){moved=document.createElement('div');moved.className='se-component se-image';moved.innerHTML='<div class="se-section se-section-image"></div>';moved.firstElementChild!.append(image);source.className='se-component se-image';}replacement[after?'after':'before'](moved);}events.push('drop');finish();
 });
 listen(document,'keydown',event=>{if(dragging&&(event as KeyboardEvent).key==='Escape'){events.push('Escape');finish();}},true);
 return {events,dispose:()=>dispose.forEach(fn=>fn()),isDragging:()=>dragging};
}

describe('photo moves through the public mouse DnD wrapper',()=>{
 it('normalizes Naver’s transient upload filename alt while retaining authored image descriptions',()=>{
  const image=photo().querySelector('img')!;image.src='https://blogfiles.pstatic.net/upload/photo.png';image.alt='photo.png';const reader=new EditorReader();readers.push(reader);const before=reader.read();image.alt='';expect(reader.read().revision).toBe(before.revision);
  image.alt='파란 하늘을 담은 사진';const described=reader.read();expect(described.revision).not.toBe(before.revision);expect(described.blocks.find(block=>block.kind==='photo')!.photo!.alt).toBe('파란 하늘을 담은 사진');
 });
 it.each(['before','after'] as const)('moves an implicit draggable image %s a paragraph, keeps caption/marks, and supports undo',async placement=>{
  const adapter=instance(),before=await adapter.snapshot(),html=root().innerHTML,engine=nativeDnD();
  expect(photo().querySelector('img')!.hasAttribute('draggable')).toBe(false);
  const result=await adapter.handle(request(before,placement));expect(result).toMatchObject({ok:true,snapshot:{canUndo:true}});
  if(!result.ok)throw new Error(result.error);
  expect(result.snapshot.blocks.find(block=>block.text==='대상 문단과 중요한 글자')!.id).not.toBe(request(before).targetId);
  expect(movedPhotoTarget(before,result.snapshot,request(before).targetId)).toBe(result.snapshot.blocks.find(block=>block.text==='대상 문단과 중요한 글자')!.id);
  expect(()=>verifyPhotoMove(before,result.snapshot,request(before,placement))).not.toThrow();
  expect(result.snapshot.blocks.find(block=>block.kind==='photo')!.photo?.caption).toBe('보존할 캡션');
  expect(engine.events).toEqual(['dragstart','mousemove','mouseup','drop','dragend']);expect(engine.isDragging()).toBe(false);
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root().innerHTML=html;return true;});
  expect(await adapter.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision,canUndo:false}});engine.dispose();
 });
 it('moves every image in a selected group together without splitting it',async()=>{
  const component=photo();component.className='se-component se-imageGroup se-l-collage';component.querySelector('.se-section')!.className='se-section se-section-imageGroup se-l-collage';component.querySelector('.se-module-image')!.insertAdjacentHTML('beforeend','<img class="se-image-resource" src="https://example.test/green.png" alt="두 번째 사진">');
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({unitDragSplitsGroup:true}),result=await adapter.handle(request(before));
  expect(result).toMatchObject({ok:true});if(result.ok){expect(result.snapshot.blocks.filter(block=>block.kind==='photo')).toHaveLength(1);expect(result.snapshot.blocks.find(block=>block.kind==='photo')!.photo?.groupSize).toBe(2);}expect(engine.isDragging()).toBe(false);engine.dispose();
 });
 it('clears an already selected group before its first-image click can activate one image unit',async()=>{
  const component=photo();component.className='se-component se-imageGroup se-l-collage';component.querySelector('.se-section')!.className='se-section se-section-imageGroup se-l-collage se-is-selected';component.querySelector('.se-module-image')!.insertAdjacentHTML('beforeend','<img class="se-image-resource" src="https://example.test/green.png" alt="두 번째 사진">');
  let selectedAtMouseDown=false;component.querySelector('img')!.addEventListener('mousedown',()=>{selectedAtMouseDown=component.querySelector('.se-section')!.classList.contains('se-is-selected');});
  const imageClick=vi.fn(()=>{if(selectedAtMouseDown)component.querySelector('.se-module-image')!.classList.add('se-is-activated');});component.querySelector('img')!.addEventListener('click',imageClick);
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({unitDragSplitsGroup:true}),result=await adapter.handle(request(before));
  expect(result).toMatchObject({ok:true});expect(selectedAtMouseDown).toBe(false);expect(imageClick).toHaveBeenCalledOnce();if(result.ok)expect(result.snapshot.blocks.find(block=>block.kind==='photo')!.photo?.groupSize).toBe(2);engine.dispose();
 });
 it('restores a fresh group alignment through the public photo toolbar when native drop resets it',async()=>{
  const component=photo(),section=component.querySelector('.se-section')!;component.className='se-component se-imageGroup se-l-collage';section.className='se-section se-section-imageGroup se-l-collage se-section-align-center';component.querySelector('.se-module-image')!.insertAdjacentHTML('beforeend','<img class="se-image-resource" src="https://example.test/green.png" alt="두 번째 사진">');
  const center=document.createElement('button');center.dataset.group='propertyToolbar';center.dataset.name='align';center.dataset.value='center';center.textContent='가운데 정렬';center.addEventListener('click',()=>section.classList.replace('se-section-align-left','se-section-align-center'));document.body.append(center);
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({commit:(destination,after)=>{destination[after?'after':'before'](component);section.classList.replace('se-section-align-center','se-section-align-left');}}),result=await adapter.handle(request(before));
  expect(result).toMatchObject({ok:true});if(result.ok){expect(result.snapshot.blocks.find(block=>block.kind==='photo')!.align).toBe('center');expect(()=>verifyPhotoMove(before,result.snapshot,request(before))).not.toThrow();}engine.dispose();
 });
 it('drops on the public paragraph beneath Naver’s caret SVG instead of refusing the native decoration',async()=>{
  document.querySelector('.se-caret-drop')!.innerHTML='<rect width="1" height="16"/>';const overlay=document.querySelector('.se-caret-drop rect')!,target=document.querySelector('#target')!;
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>overlay});Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:()=>[overlay,target]});
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD(),result=await adapter.handle(request(before));expect(result).toMatchObject({ok:true});expect(engine.events).toContain('drop');engine.dispose();
 });
 it('cancels an incorrect native drop cursor with Escape and never changes the body',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({wrongCaret:true}),undo=vi.spyOn(PublicEditorUI.prototype,'undo');
  expect(await adapter.handle(request(before))).toMatchObject({ok:false,error:expect.stringContaining('이동 커서')});expect((await adapter.snapshot()).revision).toBe(before.revision);
  expect(engine.events).toContain('Escape');expect(engine.events).not.toContain('drop');expect(engine.isDragging()).toBe(false);expect(undo).not.toHaveBeenCalled();engine.dispose();
 });
 it('cancels if the body changes before drop and preserves that change instead of undoing it',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({onMove:()=>{document.querySelector('.se-component.se-text p span')!.textContent='사용자가 추가한 글';}}),undo=vi.spyOn(PublicEditorUI.prototype,'undo');
  expect(await adapter.handle(request(before))).toMatchObject({ok:false});expect(document.querySelector('.se-component.se-text p')!.textContent).toBe('사용자가 추가한 글');
  expect(engine.events).toContain('Escape');expect(engine.events).not.toContain('drop');expect(undo).not.toHaveBeenCalled();engine.dispose();
 });
 it('does not start dragging if native selection covers only part of a group',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD({partialGroup:true});expect(await adapter.handle(request(before))).toMatchObject({ok:false,error:expect.stringContaining('전체를 선택')});expect(engine.events).toEqual([]);expect((await adapter.snapshot()).revision).toBe(before.revision);engine.dispose();
 });
 it('preserves an open native popup and leaves photos untouched',async()=>{
  document.body.insertAdjacentHTML('beforeend','<div class="se-popup">사용자가 연 창</div>');const adapter=instance(),before=await adapter.snapshot(),engine=nativeDnD();
  expect(await adapter.handle(request(before))).toMatchObject({ok:false,error:expect.stringContaining('창을 닫은')});expect(engine.events).toEqual([]);expect((await adapter.snapshot()).revision).toBe(before.revision);engine.dispose();
 });
 it('treats a repeated position as unchanged and retains the preceding undo record',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),html=root().innerHTML,engine=nativeDnD();expect((await adapter.handle(request(before))).ok).toBe(true);
  const current=await adapter.snapshot(),move=vi.spyOn(PublicEditorUI.prototype,'movePhoto');expect(await adapter.handle(request(current))).toMatchObject({ok:true,unchanged:true,snapshot:{canUndo:true}});expect(move).not.toHaveBeenCalled();
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root().innerHTML=html;return true;});expect(await adapter.handle({type:'undo'})).toMatchObject({ok:true,snapshot:{revision:before.revision}});engine.dispose();
 });
 it('restores the complete baseline if a native drop unexpectedly changes text',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),html=root().innerHTML,engine=nativeDnD({commit:(destination)=>{destination.before(photo());destination.querySelector('span')!.textContent='의도하지 않은 글';}});
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root().innerHTML=html;return true;});
  expect(await adapter.handle(request(before))).toMatchObject({ok:false,error:expect.stringContaining('복원했어요')});expect((await adapter.snapshot()).revision).toBe(before.revision);expect(undo).toHaveBeenCalledOnce();engine.dispose();
 });
});

describe('photo move position and preservation postconditions',()=>{
 function moved(){const reader=new EditorReader();readers.push(reader);const before=reader.read(),move=request(before),after=structuredClone(before),source=after.blocks.find(block=>block.kind==='photo')!;after.blocks=after.blocks.filter(block=>block!==source);after.blocks.splice(1,0,source);return {before,after,move};}
 it('accepts rebuilt paragraph IDs and native empty cursor fillers',()=>{const {before,after,move}=moved();after.blocks[2].id='rebuilt';after.blocks.splice(1,0,{id:'filler',kind:'paragraph',text:'',runs:[]});expect(()=>verifyPhotoMove(before,after,move)).not.toThrow();});
 it('retains the correct selected target when multiple paragraphs have identical text',()=>{const {before,after,move}=moved();before.blocks[0]={...structuredClone(before.blocks[1]),id:'duplicate'};after.blocks[0]={...structuredClone(before.blocks[0]),id:'rebuilt-duplicate'};after.blocks[2].id='rebuilt-target';expect(movedPhotoTarget(before,after,move.targetId)).toBe('rebuilt-target');});
 it.each(['position','text','marks','caption','layout','group','duplicate','paragraphs','title'])('rejects changed %s after a move',change=>{
  const {before,after,move}=moved(),source=after.blocks.find(block=>block.kind==='photo')!,body=after.blocks.find(block=>block.id===move.targetId)!;
  if(change==='position'){after.blocks.splice(after.blocks.indexOf(source),1);after.blocks.push(source);}
  if(change==='text'){body.text+=' 새 글';body.runs[0].text+=' 새 글';}
  if(change==='marks')body.runs[0].marks.bold=true;
  if(change==='caption')source.photo!.caption='다른 캡션';
  if(change==='layout')source.structure='다른 콜라주';
  if(change==='group')source.photo!.groupSize++;
  if(change==='duplicate')after.blocks.push(structuredClone(source));
  if(change==='paragraphs')after.blocks.splice(3,0,{...structuredClone(body),id:'extra'});
  if(change==='title')after.title='다른 제목';
  expect(()=>verifyPhotoMove(before,after,move)).toThrow();
 });
 it('tracks caption formatting, photo size and layout while ignoring selection overlays',()=>{
  const reader=new EditorReader();readers.push(reader);const before=reader.read();photo().querySelector('.se-section')!.classList.add('se-is-selected','se-is-activated');expect(reader.read().revision).toBe(before.revision);
  photo().querySelector('strong')!.setAttribute('style','font-style:italic');expect(reader.read().revision).not.toBe(before.revision);
 });
 it('ignores the native caption focus background but still detects a glyph highlight',()=>{
  document.body.insertAdjacentHTML('beforeend','<style>.se-caption.se-is-focused{background-color:rgb(241,241,241)}</style>');const reader=new EditorReader();readers.push(reader);const before=reader.read();
  photo().querySelector('.se-caption')!.classList.add('se-is-focused');expect(reader.read().revision).toBe(before.revision);
  photo().querySelector('strong')!.setAttribute('style','background-color:#ffcdc0');expect(reader.read().revision).not.toBe(before.revision);
 });
 it('ignores toolbar preview paragraphs and links inside a caption slot',()=>{
  const reader=new EditorReader();readers.push(reader);const before=reader.read();photo().querySelector('.se-caption')!.insertAdjacentHTML('beforeend','<div class="__se-toolbar-slot"><p style="text-align:right">메뉴 미리보기</p><a href="https://example.test/help">도움말</a><div class="se-section se-l-preview" style="width:10px"></div></div>');
  expect(reader.read().revision).toBe(before.revision);
 });
 it('normalizes caption inline style serialization without hiding paragraph alignment changes',()=>{
  const caption=photo().querySelector<HTMLElement>('.se-caption p')!;caption.setAttribute('style','line-height:1.5');const reader=new EditorReader();readers.push(reader);const before=reader.read();
  caption.setAttribute('style','line-height: 1.5;');expect(reader.read().revision).toBe(before.revision);
  caption.style.textAlign='right';expect(reader.read().revision).not.toBe(before.revision);
 });
});
