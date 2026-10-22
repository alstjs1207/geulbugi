import { EditorReader } from './reader';
import { sliceRuns } from '../core/hash';
import type { Format, EditorRequest } from '../core/types';
import {assertNaverFormat,isNaverQuoteStyle,resolveQuoteStyle} from '../core/naver-format-options';
import {quoteTarget} from '../core/quote-target';
import {photoImageCount} from './postconditions';
import {PendingNativeEditError,waitNativeRevision} from './native-operation';
export class PendingNativeImportError extends Error{}
export class PendingNativeLinebreakError extends PendingNativeEditError{}
function nativeColor(value:string|undefined):string|undefined{
 if(!value)return;const rgb=value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*1)?\)$/);
 return rgb?'#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):value.toLowerCase();
}
export class PublicEditorUI {
 private formatGuard:()=>void=()=>{};
 constructor(private reader:EditorReader,private didEdit:()=>void){}
 private visible(el:HTMLElement){const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&!el.closest('[aria-hidden="true"],[hidden]');}
 private label(el:HTMLElement){return (el.getAttribute('aria-label')||el.querySelector('.se-toolbar-option-label,.se-toolbar-label,.se-blind')?.textContent||el.getAttribute('title')||el.textContent||'').trim();}
 button(label:RegExp):HTMLElement|null{
  return [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].find(el=>this.visible(el)&&label.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].filter(Boolean).join(' ')))??null;
 }
 async movePhoto(request:Extract<EditorRequest,{type:'photo-move'}>,guard:()=>void):Promise<void>{
  if([...document.querySelectorAll<HTMLElement>('.se-popup')].some(el=>this.visible(el)))throw new Error('열려 있는 네이버 창을 닫은 뒤 사진을 이동해 주세요.');
  const snapshot=this.reader.read(),photo=snapshot.blocks.find(block=>block.id===request.photoId),target=snapshot.blocks.find(block=>block.id===request.targetId);
  const source=this.reader.elements.get(request.photoId),destination=this.reader.elements.get(request.targetId);
  // SmartEditor uses its public mouse-driven DnD wrapper. Images are implicitly
  // draggable; neither the component nor its image has draggable="true".
  const handle=source?.querySelector<HTMLImageElement>('img.se-image-resource');
  const wrapper=source?.closest('.se-dnd-wrap:not(.se-dnd-wrap-native)');
  if(!photo?.photo||!target||!source||!destination||!handle||!wrapper||!wrapper.contains(destination))throw new Error('네이버 사진 이동 요소를 찾지 못했어요. 글쓰기 탭을 새로고침해 주세요.');
  const view=document.defaultView;if(!view)throw new Error('네이버 글쓰기 화면에 다시 연결해 주세요.');
  const mouse=(type:string,node:Element,x:number,y:number)=>node.dispatchEvent(new view.MouseEvent(type,{bubbles:true,cancelable:true,view,button:0,buttons:type==='mouseup'||type==='click'?0:1,clientX:x,clientY:y,screenX:x,screenY:y}));
  if(source.matches('.se-imageGroup')){
   // A second image click inside an already selected group activates one unit.
   // Clear that selection through a public paragraph click before selecting it.
   destination.scrollIntoView({block:'center'});const range=this.reader.rangeAt(target.id,0),rect=[...range.getClientRects()].find(rect=>rect.height>0),bounds=destination.getBoundingClientRect();
   const x=rect?rect.left+.25:bounds.left+bounds.width/2,y=rect?rect.top+rect.height/2:bounds.top+bounds.height/2;
   for(const type of ['mousedown','mouseup','click'])mouse(type,destination,x,y);
   await new Promise(resolve=>setTimeout(resolve,60));guard();
  }
  source.scrollIntoView({block:'center'});guard();
  const from=handle.getBoundingClientRect();if(!this.visible(handle))throw new Error('이동할 사진이 표시된 뒤 다시 실행해 주세요.');
  const startX=from.left+from.width/2,startY=from.top+from.height/2;
  const section=handle.closest('.se-section');
  for(const type of ['mousedown','mouseup','click'])mouse(type,handle,startX,startY);
  await new Promise(resolve=>setTimeout(resolve,60));guard();
  // Selecting one image in a collage/slide must select the containing section.
  // Refuse a partial selection so a photo group is never silently split.
  if(!section?.classList.contains('se-is-selected')||!source.contains(section)||[...source.querySelectorAll('img.se-image-resource')].some(image=>!section.contains(image))||source.matches('.se-imageGroup')&&!!source.querySelector('.se-module-image.se-is-activated'))throw new Error('사진 묶음 전체를 선택하지 못했어요. 네이버에서 사진 선택 상태를 확인해 주세요.');
  let started=false,ended=false,dropped=false;
  const drop=(event:Event)=>{if(event.target instanceof Node&&destination.contains(event.target)){dropped=true;this.didEdit();}};
  const end=(event:Event)=>{if(event.target instanceof Node&&source.contains(event.target))ended=true;};
  document.addEventListener('drop',drop,true);document.addEventListener('dragend',end,true);
  try{
   started=true;
   handle.dispatchEvent(new view.DragEvent('dragstart',{bubbles:true,cancelable:true,view,dataTransfer:new DataTransfer(),button:0,buttons:1,clientX:startX,clientY:startY,screenX:startX,screenY:startY}));
   guard();if(!document.querySelector('.se-dragging-ghost'))throw new Error('네이버 사진 이동 시작을 확인하지 못했어요. 본문을 변경하지 않습니다.');
   destination.scrollIntoView({block:'center'});guard();
   const range=this.reader.rangeAt(target.id,request.placement==='before'?0:target.text.length);
   const rect=[...range.getClientRects()].find(rect=>rect.height>0),bounds=destination.getBoundingClientRect();
   if(!this.visible(destination)||target.text&&!rect)throw new Error('사진을 넣을 문단 경계를 확인하지 못했어요. 문단을 다시 선택해 주세요.');
   const x=rect?Math.max(bounds.left+.25,Math.min(bounds.right-.25,rect.left+.25)):bounds.left+bounds.width/2,y=rect?rect.top+rect.height/2:bounds.top+bounds.height/2;
   let node=document.elementFromPoint(x,y);
   // Naver's own caret is an SVG above the paragraph. Resolve the same public
   // glyph under that decoration; other overlays must still block the move.
   if(node?.closest('.se-selection')&&document.elementsFromPoint)node=document.elementsFromPoint(x,y).find(element=>destination.contains(element))??null;
   if(!node||!destination.contains(node))throw new Error('사진을 넣을 문단이 다른 화면에 가려져 있어요. 네이버에서 문단을 확인해 주세요.');
   mouse('mousemove',node,x,y);
   const boundaryMatches=()=>{
    const caret=document.querySelector<HTMLElement>('.se-selection .se-caret-drop'),parent=caret?.parentElement;
    if(!caret||!parent)return false;
    const origin=parent.getBoundingClientRect(),left=parseFloat(caret.style.left)+origin.left,top=parseFloat(caret.style.top)+origin.top,height=parseFloat(caret.style.height);
    if(![left,top,height].every(Number.isFinite)||height<=0)return false;
    return rect?Math.abs(left-rect.left)<=1.5&&Math.abs(top-rect.top)<=1.5&&Math.abs(height-rect.height)<=2:left>=bounds.left-1&&left<=bounds.right+1&&top>=bounds.top-1&&top+height<=bounds.bottom+1;
   };
   const deadline=Date.now()+600;
   while(!boundaryMatches()&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,30));guard();}
   guard();if(!boundaryMatches())throw new Error('네이버 이동 커서가 문단 앞·뒤에 놓이지 않았어요. 본문을 변경하지 않습니다.');
   // Mouseup makes Naver emit drop AND dragend and release its mouse/key
   // listeners. Dispatching only DragEvents leaves its DnD wrapper active.
   mouse('mouseup',node,x,y);
   if(!dropped||!ended)throw new Error('사진 이동 종료를 확인하지 못했어요. 네이버에서 사진 위치를 확인해 주세요.');
   if(source.matches('.se-imageGroup')&&photo.align){
    await new Promise(resolve=>setTimeout(resolve,100));const current=this.reader.read(),moved=current.blocks.find(block=>block.kind==='photo'&&block.componentId===photo.componentId);
    // A fresh upload can have theme alignment rather than an explicit native
    // value. Native DnD resets it; restore through the public photo toolbar.
    if(moved?.photo?.groupSize===photo.photo.groupSize&&moved.align!==photo.align){
     const movedElement=this.reader.elements.get(moved.id),image=movedElement?.querySelector<HTMLImageElement>('img.se-image-resource');
     if(!movedElement||!image)throw new Error('이동한 사진 묶음의 정렬을 확인하지 못했어요.');
     const find=()=>[...document.querySelectorAll<HTMLElement>('button[data-group="propertyToolbar"][data-name="align"]')].find(button=>button.getAttribute('data-value')===photo.align&&this.visible(button)&&!button.matches(':disabled,[aria-disabled="true"]'));
     if(!find()){
      movedElement.scrollIntoView({block:'center'});const bounds=image.getBoundingClientRect();for(const type of ['mousedown','mouseup','click'])mouse(type,image,bounds.left+bounds.width/2,bounds.top+bounds.height/2);
     }
     const deadline=Date.now()+2_000;let control=find();while(!control&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,40));control=find();}
     if(!control)throw new Error('네이버 사진 정렬 옵션을 찾지 못했어요.');await this.clickEdit(control);
    }
   }
  }finally{
   if(started&&!ended)document.body.dispatchEvent(new view.KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));
   document.removeEventListener('drop',drop,true);document.removeEventListener('dragend',end,true);
  }
 }
 async uploadPhotos(files:File[]):Promise<void>{
  if([...document.querySelectorAll<HTMLElement>('.se-popup')].some(el=>this.visible(el)))throw new Error('열려 있는 네이버 창을 닫은 뒤 사진을 추가해 주세요.');
  const control=this.button(/사진 추가|사진 첨부/);
  if(!control||control.matches(':disabled,[aria-disabled="true"]'))throw new Error('네이버 사진 추가 버튼을 찾지 못했어요.');
  const selector='input#hidden-file[type="file"][multiple][accept*=".jpg"][accept*=".png"]';
  const previous=new Set(document.querySelectorAll(selector)),before=this.reader.read();
  control.click();const deadline=Date.now()+2_000;let input:HTMLInputElement|undefined;
  while(Date.now()<deadline){
   const candidates=[...document.querySelectorAll<HTMLInputElement>(selector)].filter(el=>!previous.has(el));
   if(candidates.length===1){input=candidates[0];break;}
   await new Promise(resolve=>setTimeout(resolve,40));
  }
  if(!input)throw new Error('네이버 사진 업로드 입력을 찾지 못했어요. 네이버 글쓰기 탭을 새로고침해 주세요.');
  const current=this.reader.read();
  if(current.documentKey!==before.documentKey||current.revision!==before.revision)throw new Error('사진을 전달하기 전에 본문이 바뀌었어요. 위치를 다시 선택해 주세요.');
  const transfer=new DataTransfer();for(const file of files)transfer.items.add(file);
  input.files=transfer.files;this.didEdit();input.dispatchEvent(new Event('change',{bubbles:true}));
  if(files.length>1){
   const layoutDeadline=Date.now()+2_000;let popup:HTMLElement|undefined;
   while(Date.now()<layoutDeadline){
    popup=[...document.querySelectorAll<HTMLElement>('.se-popup-image-type')].find(el=>this.visible(el));if(popup)break;
    const current=this.reader.read();if(photoImageCount(current.blocks)>photoImageCount(before.blocks))return;
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   if(!popup)throw new PendingNativeImportError('네이버 사진 첨부 방식 창을 확인하지 못했어요. 네이버에서 결과를 확인해 주세요.');
   const current=this.reader.read(),option=popup.querySelector<HTMLElement>('label[for="image-type-list"]');
   if(current.documentKey!==before.documentKey||current.revision!==before.revision){popup.querySelector<HTMLElement>('.se-popup-close-button')?.click();throw new Error('사진 첨부 방식을 선택하기 전에 본문이 바뀌었어요.');}
   if(!option||!this.visible(option))throw new PendingNativeImportError('네이버 개별사진 옵션을 찾지 못했어요. 네이버에서 사진 첨부 방식을 확인해 주세요.');
   option.click();
  }
 }
 private async clickEdit(control:HTMLElement){
  this.formatGuard();const before=this.reader.read();
  if(control.matches(':disabled,[aria-disabled="true"]'))throw new Error('사용할 수 없는 네이버 편집 도구예요.');
  control.click();this.didEdit();
  await waitNativeRevision(this.reader,before,this.formatGuard,'네이버 서식 적용의 완료를 아직 확인하지 못했어요.');
 }
 private menus(control:HTMLElement):HTMLElement[]{
  const ids=[control.getAttribute('aria-controls'),control.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const controlled=ids.map(id=>document.getElementById(id)).filter((el):el is HTMLElement=>!!el);if(controlled.length)return controlled;
  // The live alignment popup puts its listbox beside the open/close button.
  // Stop at a local menu rather than treating every toolbar's options as one.
  for(let parent=control.parentElement,level=0;parent&&level<3;parent=parent.parentElement,level++){
   if(parent===document.body||parent===document.documentElement)break;
   const menus=[...parent.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]')].filter(el=>!el.contains(control));
   if(menus.length===1)return menus;if(menus.length>1)break;
  }
  return [];
 }
 private async choose(button:HTMLElement,match:(el:HTMLElement)=>boolean,error:string,equivalent=false){
  const selector='[role="option"],[role="menuitem"],button,[data-value]';
  const alreadyVisible=new Set([...document.querySelectorAll<HTMLElement>(selector)].filter(el=>this.visible(el)));
  const open=button.getAttribute('aria-expanded')==='true'||/닫기/.test(this.label(button))||button.getAttribute('aria-expanded')!=='false'&&this.menus(button).some(el=>this.visible(el));
  if(!open)button.click();
  const deadline=Date.now()+2_000;
  while(Date.now()<deadline){
   this.formatGuard();const roots=this.menus(button),visibleRoots=roots.filter(el=>this.visible(el));
   const candidates=[...document.querySelectorAll<HTMLElement>(selector)].filter(el=>el!==button&&this.visible(el)&&!el.matches(':disabled,[aria-disabled="true"]')&&match(el)&&(roots.length?visibleRoots.some(root=>root.contains(el)):!alreadyVisible.has(el)||open&&!!el.closest('[role="listbox"],[role="menu"]')));
   // A menuitem wrapper and its nested button are one control, not ambiguity.
   const options=candidates.filter(el=>!candidates.some(child=>child!==el&&el.contains(child)));
   if(options.length===1||options.length>1&&equivalent){await this.clickEdit(options[0]);return;}
   await new Promise(r=>setTimeout(r,40));
  }
  if(!open&&button.isConnected&&button.getAttribute('aria-expanded')!=='false')button.click();
  throw new Error(error);
 }
 private async alignment(align:NonNullable<Format['align']>,allowSkip:boolean){
  const snapshot=this.reader.read(),selection=snapshot.selection;
  if(allowSkip&&selection?.valid){const from=snapshot.blocks.findIndex(b=>b.id===selection.blockId),to=snapshot.blocks.findIndex(b=>b.id===selection.endBlockId),blocks=snapshot.blocks.slice(from,to+1).filter(b=>['paragraph','heading','quote'].includes(b.kind));if(from>=0&&to>=from&&blocks.length&&blocks.every(b=>b.align===align))return;}
  const control=this.button(/정렬\s*(열기|닫기)/);if(!control)throw new Error('네이버 정렬 메뉴를 찾을 수 없어요. 본문 글자를 다시 선택해 주세요.');
  const name={left:'왼쪽',center:'가운데',right:'오른쪽'}[align];
  await this.choose(control,el=>{const label=this.label(el).replace(/\s+/g,'');return label.includes(name)&&/(정렬|맞춤)/.test(label);},'네이버 정렬 옵션을 찾을 수 없어요. 본문 글자를 다시 선택한 뒤 정렬 메뉴를 확인해 주세요.');
 }
 async insertLinkCard(url:string){
  const before=this.reader.read(),position=before.selection,source=before.blocks.find(b=>b.id===position?.blockId);
  if(!position?.valid||!position.collapsed||!source||!['paragraph','heading'].includes(source.kind))throw new Error('미리보기 카드를 넣을 본문 커서 위치를 다시 선택해 주세요.');
  if([...document.querySelectorAll<HTMLElement>('.se-popup')].some(el=>this.visible(el)))throw new Error('열려 있는 네이버 창을 닫은 뒤 다시 삽입해 주세요.');
  const control=this.button(/링크\s*추가/);
  if(!control||control.matches(':disabled,[aria-disabled="true"]'))throw new Error('네이버 링크 추가 버튼을 찾지 못했어요.');
  const range=this.reader.restoreSelection(),inputDocument=this.reader.commandDocument(),native=inputDocument.defaultView?.getSelection();
  if(!range.collapsed||inputDocument!==document&&(!native?.rangeCount||!native.isCollapsed))throw new Error('미리보기 카드를 넣을 본문 커서 위치를 다시 선택해 주세요.');
  // Load the native preview in its dialog, then insert the card once. Pasting
  // into the body requires delayed URL selection/deletion, which can target
  // unrelated native selection state. This path never sends editing keys.
  let popup:HTMLElement|undefined,submitted=false,interrupted=false;
  const documents=[...new Set([document,inputDocument])];
  const onInteraction=(event:Event)=>{if(event.isTrusted)interrupted=true;};
  for(const doc of documents)for(const type of ['keydown','mousedown','touchstart'])doc.addEventListener(type,onInteraction,true);
  const unchanged=()=>{
   const current=this.reader.read();
   if(interrupted||current.documentKey!==before.documentKey||current.revision!==before.revision)throw new Error('미리보기를 불러오는 동안 본문이나 커서가 바뀌어 삽입을 취소했어요.');
  };
  try{
   control.click();const openDeadline=Date.now()+2_000;
   while(Date.now()<openDeadline){
    unchanged();popup=[...document.querySelectorAll<HTMLElement>('.se-popup-oglink')].find(el=>this.visible(el));if(popup)break;
    await new Promise(r=>setTimeout(r,40));
   }
   // The native dialog automatically searches the copied URL on mount. Its
   // response can overwrite a second search, even after that search succeeds.
   // Wait for the public loading state to settle before supplying our URL.
   const initialDeadline=Date.now()+15_000;
   while(popup?.querySelector('.se-popup-oglink-loading.se-is-on')){
    unchanged();if(!popup.isConnected||!this.visible(popup))throw new Error('네이버 링크 미리보기 삽입을 취소했어요.');
    if(Date.now()>=initialDeadline)throw new Error('네이버 링크 창의 초기 조회가 끝나지 않았어요. 본문은 그대로 유지했어요. 다시 시도해 주세요.');
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   const field=popup?.querySelector<HTMLInputElement>('.se-popup-oglink-input'),search=popup?.querySelector<HTMLButtonElement>('.se-popup-oglink-button'),confirm=popup?.querySelector<HTMLButtonElement>('.se-popup-button-confirm');
   if(!popup||!field||!search||!confirm)throw new Error('네이버 링크 미리보기 창을 확인하지 못했어요.');
   const view=field.ownerDocument.defaultView!;
   Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'value')!.set!.call(field,url);
   field.dispatchEvent(new view.Event('input',{bubbles:true}));field.dispatchEvent(new view.Event('change',{bubbles:true}));
   await new Promise(resolve=>setTimeout(resolve,0));unchanged();
   if(!field.isConnected||field.value!==url)throw new Error('네이버 링크 미리보기 삽입을 취소했어요.');
   search.click();
   const previewDeadline=Date.now()+15_000;let title:string|undefined,description:string|undefined,hasPreviewImage=false;
   while(Date.now()<previewDeadline){
    unchanged();if(!popup.isConnected||!this.visible(popup)||field.value!==url)throw new Error('네이버 링크 미리보기 삽입을 취소했어요.');
    const preview=popup.querySelector('.se-popup-oglink-preview'),thumbnail=preview?.querySelector('.se-oglink-thumbnail');
    title=preview?.querySelector('.se-oglink-title')?.textContent?.trim();description=preview?.querySelector('.se-oglink-summary')?.textContent?.trim()??'';
    if(title&&!confirm.disabled&&!popup.querySelector('.se-popup-oglink-loading.se-is-on')&&(!thumbnail||thumbnail.querySelector('img[src]'))){hasPreviewImage=!!thumbnail?.querySelector('img[src]');break;}
    title=undefined;await new Promise(r=>setTimeout(r,40));
   }
   if(!title)throw new Error('네이버 링크 미리보기를 불러오지 못했어요. 본문은 그대로 유지했어요. 다시 시도해 주세요.');
   unchanged();submitted=true;confirm.click();this.didEdit();
   const insertDeadline=Date.now()+8_000;
   while(Date.now()<insertDeadline){
    const cards=this.reader.read().blocks.filter(b=>b.kind==='link-card'&&!before.blocks.some(old=>old.id===b.id));
    if(cards.length===1){
     const card=cards[0],element=this.reader.elements.get(card.id),thumbnail=element?.querySelector('.se-oglink-thumbnail');
     if(element?.querySelector('.se-oglink-title')?.textContent?.trim()===title&&(element.querySelector('.se-oglink-summary')?.textContent?.trim()??'')===description&&(!thumbnail||thumbnail.querySelector('img[src]'))&&(!hasPreviewImage||thumbnail?.querySelector('img[src]'))){this.reader.rememberLinkCard(card.id,url);return;}
    }
    await new Promise(r=>setTimeout(r,40));
   }
   throw new PendingNativeImportError('네이버 링크 미리보기 삽입 완료를 확인하지 못했어요. 복구 안내에서 본문을 확인하고 임시저장해 주세요.');
  }finally{
   for(const doc of documents)for(const type of ['keydown','mousedown','touchstart'])doc.removeEventListener(type,onInteraction,true);
   // Only close the dialog owned by this operation, before any body insertion.
   if(!submitted&&popup?.isConnected)popup.querySelector<HTMLButtonElement>('.se-popup-close-button')?.click();
  }
 }
 async insertParagraph(guard:()=>void=()=>{}){
  guard();const before=this.reader.read();
  const doc=this.reader.commandDocument(),view=doc.defaultView;
  if(!view||doc.body.getAttribute('contenteditable')!=='true')throw new Error('네이버 문단 입력 영역을 확인하지 못했어요.');
  const selection=view.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)throw new Error('네이버 입력 영역에 선택한 글자가 있어 줄바꿈을 취소했어요. 본문 커서를 다시 선택해 주세요.');
  doc.body.focus();
  const handled=!doc.body.dispatchEvent(new view.KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
  if(!handled)throw new Error('네이버가 문단 나누기를 처리하지 않았어요.');
  this.didEdit();
  const deadline=Date.now()+2000;let revision=before.revision,settledAt=Date.now();
  while(Date.now()<deadline){
   guard();const current=this.reader.read();
   if(current.sessionId!==before.sessionId||current.documentKey!==before.documentKey)throw new Error('줄바꿈 중 편집 문서가 바뀌었어요.');
   if(current.revision!==revision){revision=current.revision;settledAt=Date.now();}
   if(revision!==before.revision&&Date.now()-settledAt>=80)return;
   await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw new PendingNativeLinebreakError('네이버 문단 나누기의 완료를 아직 확인하지 못했어요.');
 }
 async format(format:Format,guard:()=>void=()=>{}){
  this.formatGuard=guard;
  try{guard();await this.formatSelection(format);guard();}finally{this.formatGuard=()=>{};}
 }
 private async formatSelection(format:Format){
  assertNaverFormat(format);
  const snapshot=this.reader.read(),selection=format.paragraphStyle==='quote'?quoteTarget(snapshot):snapshot.selection;let targetId=selection?.blockId,targetEndId=selection?.endBlockId;
  if(!selection?.valid||selection.collapsed)throw new Error('서식을 적용할 글자를 먼저 선택해 주세요.');
  const chosenBlocks=()=>{const blocks=this.reader.read().blocks,from=blocks.findIndex(block=>block.id===targetId),to=blocks.findIndex(block=>block.id===targetEndId);return from<0||to<from?[]:blocks.slice(from,to+1);};
  const chosenRuns=()=>{const blocks=chosenBlocks();return blocks.flatMap((block,index)=>sliceRuns(block.runs,index===0?selection.start:0,index===blocks.length-1?selection.end:block.text.length)).filter(run=>run.text.trim());};
  if(format.paragraphStyle==='quote'){
   if(selection.blockId===selection.endBlockId)await this.reader.selectParagraph(selection.blockId);
   else await this.reader.selectParagraphs(selection.blockId,selection.endBlockId);
  }
  else this.reader.restoreSelection(true);
  // We preserve the editor's own remembered selection while clicking its public toolbar.
  if(format.paragraphStyle==='quote'){
   const from=snapshot.blocks.findIndex(b=>b.id===selection.blockId),to=snapshot.blocks.findIndex(b=>b.id===selection.endBlockId),selectedBlocks=snapshot.blocks.slice(from,to+1),selected=selectedBlocks[0];
   if(!selected||from<0||to<from||selection.start!==0||selection.end!==selectedBlocks.at(-1)!.text.length)throw new Error('인용구로 바꿀 문단 전체를 선택해 주세요.');
   const source=selectedBlocks.flatMap(block=>block.runs).filter(r=>r.text.trim()),fonts=[...new Set(source.map(r=>r.marks.fontSize))],italics=[...new Set(source.map(r=>!!r.marks.italic))],bolds=[...new Set(source.map(r=>!!r.marks.bold))],underlines=[...new Set(source.map(r=>!!r.marks.underline))],colors=[...new Set(source.map(r=>nativeColor(r.marks.color)))],backgrounds=[...new Set(source.map(r=>nativeColor(r.marks.background)))];
   const quoteStyle=resolveQuoteStyle(format,selected);
   if(!isNaverQuoteStyle(quoteStyle))throw new Error('현재 인용구 모양을 확인하지 못했어요. 프리셋에서 지원 모양을 선택해 주세요.');
   if(source.some(r=>r.marks.href)||format.fontSize===undefined&&fonts.length!==1||italics.length!==1||underlines.length!==1||format.bold===undefined&&bolds.length!==1||format.color===undefined&&colors.length!==1||format.background===undefined&&backgrounds.length!==1)throw new Error('링크나 서로 다른 글자 서식이 있는 문단은 인용구로 바꿀 수 없어요. 서식이 같은 문단을 선택해 주세요.');
   if(selectedBlocks.some(block=>block.kind==='quote')&&selectedBlocks.some(block=>block.kind!=='quote'||block.componentId!==selected.componentId))throw new Error('기존 인용구와 다른 문단은 나누어 선택해 주세요.');
   // Live v17 conversion removes highlights and exposes no usable background
   // tool in quotation component mode. Reject before creating an undo history
   // until selecting quotation glyphs restores a verified public tool path.
   if(format.background!==undefined||selected.kind!=='quote'&&backgrounds.some(Boolean))throw new Error('배경색이 있는 인용구 변환은 아직 지원하지 않아요. 배경색 없는 문단과 프리셋을 선택해 주세요.');
   const requestedColor=format.color,requestedBackground=format.background;
   const preserved={...format,...(format.fontSize===undefined&&fonts[0]!==undefined?{fontSize:fonts[0]}:{}),...(format.bold===undefined?{bold:bolds[0]}:{}),...(format.color===undefined&&colors[0]?{color:colors[0]}:{}),...(format.background===undefined&&backgrounds[0]?{background:backgrounds[0]}:{})};
   assertNaverFormat(preserved);
   const originalText=snapshot.blocks.filter(b=>b.kind!=='photo').map(b=>b.text).join('');
   if(selected.kind!=='quote'){
    let insert=this.button(/인용구로 변경/);const deadline=Date.now()+2_000;
    while(!insert&&Date.now()<deadline){await new Promise(r=>setTimeout(r,40));insert=this.button(/인용구로 변경/);}
    if(!insert)throw new Error('선택 문단의 네이버 인용구 변경 버튼을 찾을 수 없어요. 문단 전체를 다시 선택해 주세요.');
    await this.clickEdit(insert);
   }
   const after=this.reader.read();
   if(after.blocks.filter(b=>b.kind!=='photo').map(b=>b.text).join('')!==originalText||!after.blocks.some(b=>b.kind==='quote'&&b.text===selected.text))throw new Error('선택 문단이 네이버 인용구로 변환되는 동작을 확인하지 못했어요. 이 초안에서 원래 상태로 복원합니다.');
   const textBlocks=(blocks:typeof snapshot.blocks)=>blocks.filter(b=>['paragraph','heading','quote'].includes(b.kind)&&b.text.trim());
   const visibleBefore=textBlocks(snapshot.blocks),visibleAfter=textBlocks(after.blocks);
   const convertedBlocks=selectedBlocks.map(block=>after.blocks.find(current=>current.id===block.id)??visibleAfter[visibleBefore.findIndex(current=>current.id===block.id)]);
   if(convertedBlocks.some((block,index)=>!block||block.kind!=='quote'||block.text!==selectedBlocks[index].text))throw new Error('선택 문단의 인용구 위치를 확인하지 못했어요.');
   const converted=convertedBlocks[0]!;
   targetId=converted.id;
   targetEndId=convertedBlocks.at(-1)!.id;
   if(converted.quoteStyle!==quoteStyle){
    let layout:HTMLElement|undefined;
    const deadline=Date.now()+2_000;
    while(Date.now()<deadline){
     const options=[...document.querySelectorAll<HTMLElement>('button[data-group="propertyToolbar"][data-name="quotation-layout"]')].filter(el=>this.visible(el)&&!el.matches(':disabled,[aria-disabled="true"]')&&el.dataset.value===quoteStyle);
     if(options.length===1){layout=options[0];break;}
     await new Promise(r=>setTimeout(r,40));
    }
    if(!layout)throw new Error('선택한 네이버 인용구 모양 도구를 찾을 수 없어요. 인용구 문단을 다시 선택해 주세요.');
    await this.clickEdit(layout);
    const appliedDeadline=Date.now()+2_000;
    while(this.reader.read().blocks.find(b=>b.id===targetId)?.quoteStyle!==quoteStyle&&Date.now()<appliedDeadline)await new Promise(r=>setTimeout(r,40));
    if(this.reader.read().blocks.find(b=>b.id===targetId)?.quoteStyle!==quoteStyle)throw new Error('선택한 인용구 모양이 적용됐는지 확인하지 못했어요. 이 초안에서 원래 상태로 복원합니다.');
   }
   // Conversion supplies native 19px/italic defaults. Restore the source's
   // unspecified glyph properties through public tools rather than relaxing QA.
   const current=this.reader.read().blocks.find(b=>b.id===targetId);
   if(current&&!!current.runs.find(r=>r.text.trim())?.marks.italic!==italics[0]){
    const italic=this.button(/기울이기 적용|기울이기 해제/);if(!italic)throw new Error('기존 기울기를 보존할 네이버 도구를 찾을 수 없어요.');await this.clickEdit(italic);
   }
   if(current&&!!current.runs.find(r=>r.text.trim())?.marks.underline!==underlines[0]){
    const underline=this.button(/밑줄 적용|밑줄 해제/);if(!underline)throw new Error('기존 밑줄을 보존할 네이버 도구를 찾을 수 없어요.');await this.clickEdit(underline);
   }
   const glyphs=this.reader.read().blocks.filter(block=>convertedBlocks.some(converted=>converted?.id===block.id)).flatMap(block=>block.runs).filter(r=>r.text.trim());
   if(requestedColor===undefined&&glyphs?.every(r=>nativeColor(r.marks.color)===preserved.color))delete preserved.color;
   if(requestedBackground===undefined&&glyphs?.every(r=>nativeColor(r.marks.background)===preserved.background))delete preserved.background;
   format=preserved;
  }else if(format.paragraphStyle==='body'&&!chosenBlocks().every(block=>block.kind!=='quote')){
   const style=this.button(/문단 서식 변경/);if(!style)throw new Error('네이버 문단 서식 메뉴를 찾을 수 없어요.');
   await this.choose(style,el=>/^(본문|일반|일반 문단)$/.test(this.label(el)),'일반 문단 옵션을 확인하지 못했어요.');
  }
  // Resolve paragraph tools before editing glyphs so an unavailable alignment
  // menu cannot leave a partially applied size/bold/colour operation to undo.
  if(format.align&&format.paragraphStyle!=='quote'&&!(chosenBlocks().length&&chosenBlocks().every(block=>block.align===format.align)))await this.alignment(format.align,format.paragraphStyle===undefined);
  if(format.fontSize!==undefined&&!(chosenRuns().length&&chosenRuns().every(run=>run.marks.fontSize===format.fontSize))){
   const control=this.button(/글자 크기 변경/);if(!control)throw new Error('네이버 글자 크기 메뉴를 찾을 수 없어요.');
   const size=String(format.fontSize);
   await this.choose(control,el=>{
    const label=this.label(el);
    return (el.getAttribute('data-name')==='font-size'&&el.getAttribute('data-value')==='fs'+size)||(label===size||label===size+'px'||label===size+' 픽셀')&&!!el.closest('[class*="font"],[class*="size"],[role="listbox"],[role="menu"]');
   },'네이버에서 지원하는 글자 크기 '+size+' 옵션을 확인하지 못했어요.');
  }
  if(format.bold!==undefined){
   const chosen=chosenRuns(),needsChange=!chosen.length||chosen.some(r=>!!r.marks.bold!==format.bold);
   if(needsChange){
    const button=this.button(/굵기 적용|굵기 해제|굵게/);if(!button)throw new Error('네이버 굵게 버튼을 찾을 수 없어요.');await this.clickEdit(button);
    // A mixed selection's first toggle applies bold to all text. Removing bold
    // then needs the native off toggle; never infer success from one click.
    if(format.bold===false){
     const runs=chosenRuns();
     if(runs.length&&runs.every(r=>!!r.marks.bold)){const off=this.button(/굵기 해제|굵기 적용|굵게/);if(!off)throw new Error('네이버 굵기 해제 버튼을 찾을 수 없어요.');await this.clickEdit(off);}
    }
   }
  }
  for(const [key,label] of [['color',/글자색 변경/],['background',/글자 배경색 변경/]] as const){
   const value=format[key];if(!value||chosenRuns().length&&chosenRuns().every(run=>nativeColor(run.marks[key])===nativeColor(value)))continue;const button=this.button(label);if(!button)throw new Error('네이버 색상 메뉴를 찾을 수 없어요.');
   await this.choose(button,el=>{
    return el.tagName==='BUTTON'&&(el.getAttribute('data-color')??el.getAttribute('data-value')??this.label(el)).toLowerCase()===value.toLowerCase()&&!!el.closest('[class*="color"],[role="menu"],[role="dialog"]');
   },'지정한 색상을 네이버 색상 메뉴에서 확인하지 못했어요. 지원 옵션 확인이 필요합니다.',true);
  }
 }
 async undo(guard:()=>void=()=>{}):Promise<boolean>{
  guard();const before=this.reader.read(),button=this.button(/실행 취소|되돌리기/);
  if(button){
   if(button.matches(':disabled,[aria-disabled="true"]'))return false;
   button.click();await waitNativeRevision(this.reader,before,guard,'네이버 되돌리기의 완료를 아직 확인하지 못했어요.');return true;
  }
  const doc=this.reader.commandDocument(),target=doc.body,view=doc.defaultView;if(!view)return false;
  target.focus();const mac=/Mac|iPhone|iPad/.test(navigator.platform);
  const handled=!target.dispatchEvent(new view.KeyboardEvent('keydown',{key:'z',code:'KeyZ',keyCode:90,which:90,metaKey:mac,ctrlKey:!mac,bubbles:true,cancelable:true}));
  if(handled||this.reader.read().revision!==before.revision){await waitNativeRevision(this.reader,before,guard,'네이버 되돌리기의 완료를 아직 확인하지 못했어요.');return true;}
  const ok=doc.queryCommandSupported?.('undo')&&doc.execCommand('undo');
  if(ok)await waitNativeRevision(this.reader,before,guard,'네이버 되돌리기의 완료를 아직 확인하지 못했어요.');return !!ok;
 }
 async redo(guard:()=>void=()=>{}):Promise<boolean>{
  guard();const before=this.reader.read(),doc=this.reader.commandDocument(),view=doc.defaultView;if(!view)return false;
  const mac=/Mac|iPhone|iPad/.test(navigator.platform);doc.body.focus();
  const handled=!doc.body.dispatchEvent(new view.KeyboardEvent('keydown',{key:mac?'z':'y',code:mac?'KeyZ':'KeyY',keyCode:mac?90:89,which:mac?90:89,metaKey:mac,ctrlKey:!mac,shiftKey:mac,bubbles:true,cancelable:true}));
  if(!handled&&this.reader.read().revision===before.revision)return false;
  await waitNativeRevision(this.reader,before,guard,'ネ이버 다시 실행의 완료를 아직 확인하지 못했어요.');return true;
 }
}
