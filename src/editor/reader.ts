import {imageAiMarked} from './photo-ai';
import type { Block, BlockKind, Marks, Run, Selection, Snapshot } from '../core/types';
import { blockSignature, documentSignature, hash, mergeRuns } from '../core/hash';
import { safeHref,canonicalLinkedUrl } from '../core/security';
import type {CardReference} from '../platform/link-card-cache';

export const ADAPTER_VERSION='naver-one-public-ui-v42';
const TEXT_SELECTOR='.se-text-paragraph';
const IGNORED_SELECTOR='.se-placeholder,.__se_placeholder,.__se-toolbar-slot,.se-set-ai-mark-button-wrapper';
type BufferSelection = { frame:HTMLIFrameElement; document:Document; range:Range; text:string };
type BufferBinding = { document:Document|null; capture:(event:Event)=>void; load:()=>void };

export class EditorReader {
 readonly sessionId=crypto.randomUUID();
 readonly elements=new Map<string,HTMLElement>();
 private ids=new WeakMap<Element,string>();
 private cardReferences=new Map<string,CardReference>();
 private remembered:Selection|null=null;
 private range:Range|null=null;
 private container:HTMLElement|null=null;
 private bufferSelection:BufferSelection|null=null;
 private bufferFrames=new Map<HTMLIFrameElement,BufferBinding>();
 private selectionIssue:string|undefined;
 private clickedParagraph:HTMLElement|null=null;
 private pointerStart:HTMLElement|null=null;
 private clickedSignature:string|null=null;
 private disposed=false;

 private observer:MutationObserver;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private selectionTimer:ReturnType<typeof setTimeout>|null=null;
 private readonly selectionListener=(event:Event)=>{
  if(event.type==='keyup'){this.clickedParagraph=null;this.clickedSignature=null;}
  if(event.type==='mousedown')this.pointerStart=event.target instanceof Node&&this.getRoot()?.contains(event.target)?this.blockElement(event.target):null;
  if(event.type==='mouseup'&&event.target instanceof Node&&this.getRoot()?.contains(event.target)){
   const paragraph=this.blockElement(event.target);
   this.clickedParagraph=paragraph===this.pointerStart?paragraph:null;
   const block=this.read().blocks.find(b=>this.elements.get(b.id)===this.clickedParagraph);
   this.clickedSignature=block&&['paragraph','heading','quote'].includes(block.kind)&&!paragraph?.closest('.se-cite')?blockSignature(block):null;
   this.onChange();
  }
  this.captureSelection();this.scheduleSelectionCapture();
 };
 onChange:()=>void=()=>{};
 private scheduleSelectionCapture():void{
  if(this.selectionTimer)clearTimeout(this.selectionTimer);
  // Naver updates its public caret after the initial mouse/selection events.
  this.selectionTimer=setTimeout(()=>{this.selectionTimer=null;if(!this.disposed)this.captureSelection();},60);
 }
 constructor(){
  this.observer=new MutationObserver(()=>{this.bindInputFrames();if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>this.onChange(),350);});
  this.observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','src','href']});
  document.addEventListener('selectionchange',this.selectionListener);
  document.addEventListener('mousedown',this.selectionListener);
  document.addEventListener('mouseup',this.selectionListener);
  document.addEventListener('keyup',this.selectionListener);
  this.bindInputFrames();
 }
 getRoot():HTMLElement|null{
  // The live writing canvas uses se-components-wrap; main-container is used by older layouts/viewers.
  const roots=[...document.querySelectorAll<HTMLElement>('.se-canvas .se-components-wrap'),...document.querySelectorAll<HTMLElement>('.se-editor .se-main-container,.se-editor .se-document,.se-main-container')];
  return roots.find(r=>r.querySelector('[contenteditable="true"]'))??roots[0]??null;
 }
 private id(element:Element):string{
  let id=this.ids.get(element);if(!id){id='b-'+crypto.randomUUID();this.ids.set(element,id);}return id;
 }
 private marks(element:Element, inherited:Marks):Marks{
  const marks={...inherited};const style=element instanceof HTMLElement?element.style:undefined;
  const computed=getComputedStyle(element);
  if(['B','STRONG'].includes(element.tagName)||style?.fontWeight==='bold'||Number(style?.fontWeight)>=600)marks.bold=true;
  if(['I','EM'].includes(element.tagName)||style?.fontStyle==='italic')marks.italic=true;
  if(element.tagName==='U'||style?.textDecoration?.includes('underline'))marks.underline=true;
  const weight=style?.fontWeight||computed.fontWeight;if(weight==='normal'||weight==='400')marks.bold=false;else if(weight==='bold'||Number(weight)>=600)marks.bold=true;
  const fontStyle=style?.fontStyle||computed.fontStyle;if(fontStyle==='normal')marks.italic=false;else if(fontStyle==='italic')marks.italic=true;
  const decoration=style?.textDecoration||computed.textDecoration;if(decoration.includes('underline'))marks.underline=true;
  const color=style?.color||computed.color;if(color)marks.color=color;
  const background=style?.backgroundColor||computed.backgroundColor;if(background&&background!=='transparent'&&background!=='rgba(0, 0, 0, 0)')marks.background=background;
  const fontSize=parseFloat(style?.fontSize||computed.fontSize);if(Number.isFinite(fontSize))marks.fontSize=fontSize;
  if(element.tagName==='A'||element.matches('.se-link[data-href]')){const href=safeHref(element.getAttribute(element.tagName==='A'?'href':'data-href')??undefined);if(href)marks.href=href;}
  return marks;
 }
 runs(node:Node,inherited:Marks={}):Run[]{
  if(node.nodeType===Node.TEXT_NODE)return [{text:node.textContent??'',marks:{...inherited}}];
  if(node instanceof DocumentFragment)return [...node.childNodes].flatMap(child=>this.runs(child,inherited));
  if(!(node instanceof Element))return [];
  if(['SCRIPT','STYLE','NOSCRIPT','BUTTON'].includes(node.tagName)||node.matches(IGNORED_SELECTOR))return [];
  if(node.tagName==='BR')return [{text:'\n',marks:{...inherited}}];
  const marks=this.marks(node,inherited);return mergeRuns([...node.childNodes].flatMap(child=>this.runs(child,marks)));
 }
 private structure(element:HTMLElement,kind:BlockKind):string|undefined{
  if(kind==='table')return hash([...element.querySelectorAll('tr,td,th')].map(e=>({tag:e.tagName,rowspan:e.getAttribute('rowspan'),colspan:e.getAttribute('colspan'),style:e.getAttribute('style')})));
  if(kind==='list')return hash([...element.querySelectorAll('li,ul,ol')].map(e=>({tag:e.tagName,start:e.getAttribute('start'),value:e.getAttribute('value'),style:e.getAttribute('style')})));
  if(kind==='link-card'||kind==='video')return hash([...element.querySelectorAll('a[href],img[src],video[src],iframe[src]')].map(e=>({tag:e.tagName,href:e.getAttribute('href'),src:e.getAttribute('src')})));
 }
 private photoStructure(element:HTMLElement):string{
  const layout=(node:Element)=>[...node.classList].filter(name=>name.startsWith('se-l-')||name.startsWith('se-section-align-'));
  const content=(node:Element)=>!node.closest(IGNORED_SELECTOR);
  const captions=[...element.querySelectorAll<HTMLElement>('.se-caption,.se-module-image-caption')].filter(content).map(caption=>{
   const paragraphs=[...caption.querySelectorAll<HTMLElement>(TEXT_SELECTOR)].filter(content);
   // Native history restores caption focus. Its grey module background is a
   // caret affordance, not a glyph highlight; never inherit it into the runs.
   return blockSignature({id:'',kind:'caption',text:'',runs:paragraphs.flatMap(paragraph=>this.runs(paragraph)),structure:hash(paragraphs.map(p=>({align:getComputedStyle(p).textAlign,style:p.style.cssText})))});
  });
  return hash({layout:layout(element),sections:[...element.querySelectorAll<HTMLElement>('.se-section')].filter(content).map(section=>({layout:layout(section),style:section.style.cssText})),modules:[...element.querySelectorAll<HTMLElement>('.se-module-image')].filter(content).map(module=>module.style.cssText),captions,links:[...element.querySelectorAll('[data-linkdata],a[href]')].filter(content).map(link=>({href:link.getAttribute('href'),data:link.getAttribute('data-linkdata')}))});
 }
 private linkCard(element:HTMLElement):Block['linkCard']{
  const urls=[...element.querySelectorAll('[data-linkdata]')].flatMap(node=>{try{return [JSON.parse(node.getAttribute('data-linkdata')??'{}').link];}catch{return [];}});
  urls.push(...[...element.querySelectorAll('a[href]')].map(node=>node.getAttribute('href')));
  const reference=this.cardReferences.get(element.id),known=reference?.fingerprint===this.cardFingerprint(element)?reference.url:undefined;
  const url=urls.map(value=>typeof value==='string'?canonicalLinkedUrl(value):undefined).find(Boolean)??known;if(!url)return;
  return {url,title:element.querySelector('.se-oglink-title')?.textContent?.trim()??'',description:element.querySelector('.se-oglink-summary')?.textContent?.trim()??'',image:safeHref(element.querySelector('img')?.getAttribute('src')??undefined),domain:element.querySelector('.se-oglink-url')?.textContent?.trim()};
 }
 private cardFingerprint(element:HTMLElement):string{
  const text=(selector:string)=>(element.querySelector(selector)?.textContent??'').replace(/\u00a0/gu,' ').trim();
  return hash({title:text('.se-oglink-title'),summary:text('.se-oglink-summary'),domain:text('.se-oglink-url')});
 }
 seedCardReferences(references:CardReference[]):void{for(const reference of references)this.cardReferences.set(reference.componentId,reference);}
 rememberLinkCard(blockId:string,url:string):void{
  const element=this.elements.get(blockId),canonical=canonicalLinkedUrl(url);
  if(!element?.matches('.se-component.se-oglink')||!element.id||!canonical)throw new Error('삽입한 카드의 주소를 연결하지 못했어요.');
  this.cardReferences.set(element.id,{componentId:element.id,url:canonical,fingerprint:this.cardFingerprint(element)});
 }
 cardReference(componentId:string):CardReference|undefined{return this.cardReferences.get(componentId);}
 private kind(element:HTMLElement):BlockKind{
  if(element.closest('.se-quotation,.se-quotation-container,blockquote'))return 'quote';
  if(element.closest('.se-table,table'))return 'table';
  if(element.closest('.se-code,pre,code'))return 'code';
  if(element.closest('ul,ol,.se-list,.se-list-item,.se-list-paragraph,.se-bullet-list,.se-numbered-list')||getComputedStyle(element).display==='list-item')return 'list';
  if(element.closest('.se-module-image-caption,.se-caption'))return 'caption';
  const style=getComputedStyle(element);const font=parseFloat(style.fontSize);
  const lead=element.querySelector<HTMLElement>('span,b,strong');const leadFont=lead?parseFloat(getComputedStyle(lead).fontSize):font;
  if(/^H[1-6]$/.test(element.tagName)||element.dataset.paragraphStyle==='heading'||((Math.max(font,leadFont)>=19)&&(style.fontWeight==='bold'||Number(style.fontWeight)>=600||!!element.querySelector('b,strong,span[style*="bold"],span[style*="700"]'))))return 'heading';
  return 'paragraph';
 }
 read():Snapshot{
  this.bindInputFrames();this.container=this.getRoot();this.elements.clear();
  const blocks:Block[]=[];let mediaPending=false;
  if(this.container){
   const candidates=[...this.container.querySelectorAll<HTMLElement>(TEXT_SELECTOR+',.se-component.se-image,.se-component.se-imageGroup,.se-component.se-video,.se-component.se-oglink,.se-component.se-table,.se-component.se-code')];
   for(const element of candidates){
    if(element.closest('.se-title-text,.se-documentTitle'))continue;
    if(element.matches(TEXT_SELECTOR)&&element.closest('.se-table,.se-code,.se-image,.se-imageGroup,.se-oglink'))continue;
    if(element.matches('.se-image')&&element.parentElement?.closest('.se-imageGroup'))continue;
    const id=this.id(element);this.elements.set(id,element);
    const component=element.closest<HTMLElement>('.se-component');
    const resourceImages=[...element.querySelectorAll<HTMLImageElement>('img.se-image-resource')];
    const images=resourceImages.length?resourceImages:[...element.querySelectorAll<HTMLImageElement>('img')];
    const imageSource=(img:HTMLImageElement)=>safeHref(img.getAttribute('src')??undefined)??safeHref(img.currentSrc||img.src)??'';
    const imageAlt=(img:HTMLImageElement)=>{const alt=img.alt??'';try{const url=new URL(imageSource(img));if(['blogfiles.pstatic.net','postfiles.pstatic.net'].includes(url.hostname)&&alt===decodeURIComponent(url.pathname.split('/').at(-1)??''))return '';}catch{}return alt;};
    if(element.matches('.se-image,.se-imageGroup')){
     if(!images.length||images.some(img=>!imageSource(img)))mediaPending=true;
     const captionElement=element.querySelector<HTMLElement>('.se-module-image-caption,.se-caption');
     const caption=captionElement?this.runs(captionElement).map(r=>r.text).join(''):'';
     const alignment=[...element.querySelector('.se-section')?.classList??[]].find(name=>name.startsWith('se-section-align-'))?.slice('se-section-align-'.length),align=['left','center','right'].includes(alignment??'')?alignment as Block['align']:undefined;
     blocks.push({id,kind:'photo',text:caption,runs:[],componentId:component?.id,structure:this.photoStructure(element),align,photo:{src:images[0]?imageSource(images[0]):'',caption,alt:images[0]?imageAlt(images[0]):'',width:images[0]?.getAttribute('width')??undefined,height:images[0]?.getAttribute('height')??undefined,groupSize:images.length,items:images.map(img=>({src:imageSource(img),aiMarked:imageAiMarked(img),alt:imageAlt(img),width:img.getAttribute('width')??undefined,height:img.getAttribute('height')??undefined,attributes:Object.fromEntries([...img.attributes].filter(a=>['alt','width','height','title','style'].includes(a.name)).map(a=>[a.name,a.name==='alt'?imageAlt(img):a.value]))}))}});
    }else{
     const runs=this.runs(element);const kind=element.matches('.se-oglink')?'link-card':element.matches('.se-video')?'video':element.matches('.se-table')?'table':element.matches('.se-code')?'code':this.kind(element);
     const align=getComputedStyle(element).textAlign;
     // Quotation layout lives on the native component/section, not the glyphs.
     // Retain unknown class values too, so a style-only change invalidates QA.
     const quote=kind==='quote'?element.closest('.se-component.se-quotation,.se-section-quotation,blockquote'):null;
     const quoteStyle=quote?[...quote.classList].find(name=>name.startsWith('se-l-'))?.slice(5)??(quote.tagName==='BLOCKQUOTE'?'default':undefined):undefined;
     blocks.push({id,kind,text:runs.map(r=>r.text).join(''),runs,...(kind==='link-card'?{linkCard:this.linkCard(element)}:{}),...(quoteStyle?{quoteStyle}:{}),structure:this.structure(element,kind),componentId:component?.id,align:['left','center','right','justify'].includes(align)?align as Block['align']:undefined});
    }
   }
  }
  const titleElement=document.querySelector<HTMLElement>('.se-title-text .se-text-paragraph,.se-documentTitle .se-text-paragraph')??document.querySelector<HTMLElement>('.se-title-text,.se-documentTitle');
  const title=(titleElement?this.runs(titleElement).map(r=>r.text).join(''):document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content??document.title.replace(/ : 네이버 블로그$/,'')).replace(/\u00a0/gu,' ').trim();
  const editable=!!this.container&&(!!this.container.querySelector('[contenteditable="true"]')||/PostWriteForm|PostUpdateForm/.test(location.pathname));
  let remembered=this.remembered;
  if(remembered){const start=blocks.find(b=>b.id===remembered!.blockId),end=blocks.find(b=>b.id===remembered!.endBlockId);remembered={...remembered,valid:!!start&&!!end&&this.selectionSignature(blocks,remembered.blockId,remembered.endBlockId)===remembered.signature&&!!this.range?.startContainer.isConnected&&!!this.range?.endContainer.isConnected&&this.bufferStillValid()};if(!remembered.valid)this.selectionIssue='선택했던 본문이나 입력 영역이 달라졌어요. 글자를 다시 선택해 주세요.';}
  const url=location.href,parsed=new URL(url),blogId=parsed.searchParams.get('blogId')??parsed.pathname.split('/').filter(Boolean)[0]??'';
  const clicked=blocks.find(b=>this.elements.get(b.id)===this.clickedParagraph),paragraphTarget=clicked&&blockSignature(clicked)===this.clickedSignature?{blockId:clicked.id,signature:this.clickedSignature}:undefined;
  return {sessionId:this.sessionId,documentKey:hash({blogId,title,editable}),adapterSignature:ADAPTER_VERSION+'-'+hash({root:this.container?.className,editable,toolbar:!!document.querySelector('button[aria-label*="인용구"],button[title*="인용구"]')}),title,url,revision:documentSignature(title,blocks),editable,blocks,selection:remembered,paragraphTarget,selectionIssue:this.selectionIssue,linkedUrls:[...new Set(blocks.flatMap(b=>[...b.runs.flatMap(r=>r.marks.href?[canonicalLinkedUrl(r.marks.href)!]:[]),...(b.linkCard?[b.linkCard.url]:[])]))],uploadBusy:!!document.querySelector('.se-upload-progress,.se-image-upload-loading,[aria-busy="true"]'),canUndo:false,mediaPending};
 }
 async loadPendingPhotos(timeout=6000,options:{signal?:AbortSignal;restoreScroll?:()=>boolean}={}):Promise<void>{
  if(!this.read().mediaPending)return;
  // Native insert/undo can recreate off-screen images as lazy SVG placeholders.
  // Read their actual public URLs again, rather than trusting cached filenames
  // or treating an unloaded image as a lost photo in the postcondition check.
  const positions:{element:HTMLElement;top:number;left:number}[]=[];
  for(let element=this.container;element;element=element.parentElement)positions.push({element,top:element.scrollTop,left:element.scrollLeft});
  const deadline=Date.now()+timeout,root=this.container;
  const check=()=>{if(options.signal?.aborted||this.disposed||this.getRoot()!==root)throw new Error('사진 자동 확인을 멈췄어요. 작업을 마친 뒤 다시 확인해 주세요.');};
  try{
   while(Date.now()<deadline){
    check();
    const pending=this.read().blocks.find(block=>block.photo&&(!block.photo.src||block.photo.items?.some(item=>!item.src)));
    if(!pending)return;
    const element=this.elements.get(pending.id);if(!element?.isConnected)break;
    element.scrollIntoView({block:'center'});
    // One image must not consume the entire budget for a long document.
    const imageDeadline=Math.min(deadline,Date.now()+2000);
    let loaded=false;
    do{
     await new Promise(resolve=>setTimeout(resolve,50));
     check();
     const block=this.read().blocks.find(block=>this.elements.get(block.id)===element);
     loaded=!!block?.photo?.src&&!block.photo.items?.some(item=>!item.src);
    }while(!loaded&&element.isConnected&&Date.now()<imageDeadline);
    if(!loaded)break;
   }
   if(this.read().mediaPending)throw new Error('작업 뒤 사진을 다시 불러오지 못했어요. 네이버에서 사진과 본문을 확인해 주세요.');
  }finally{
   if(options.restoreScroll?.()!==false)for(const {element,top,left} of positions){if(element.isConnected){if(element.scrollTop!==top)element.scrollTop=top;if(element.scrollLeft!==left)element.scrollLeft=left;}}
  }
 }
 private selectionSignature(blocks:Block[],startId:string,endId:string):string{
  const start=blocks.findIndex(b=>b.id===startId),end=blocks.findIndex(b=>b.id===endId);
  return hash(start<0||end<start?null:blocks.slice(start,end+1).map(b=>[b.id,blockSignature(b)]));
 }
 private blockElement(node:Node):HTMLElement|null{
  return (node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement)?.closest<HTMLElement>(TEXT_SELECTOR)??null;
 }
 private offset(root:HTMLElement,node:Node,offset:number):number{
  const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,offset);return this.runs(range.cloneContents()).map(r=>r.text).join('').length;
 }
 private bindInputFrames():void{
  if(this.disposed)return;
  const frames=[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')];
  for(const [frame,binding] of this.bufferFrames){
   if(!frames.includes(frame)){
    this.unbindBufferDocument(binding);frame.removeEventListener('load',binding.load);this.bufferFrames.delete(frame);
   }
  }
  for(const frame of frames){
   let binding=this.bufferFrames.get(frame);
   if(!binding){
    binding={document:null,capture:(event)=>{if(event.type==='keyup'){this.clickedParagraph=null;this.clickedSignature=null;}this.captureBufferSelection(frame);this.scheduleSelectionCapture();},load:()=>{this.bindInputFrames();}};
    this.bufferFrames.set(frame,binding);frame.addEventListener('load',binding.load);
   }
   let doc:Document|null=null;try{doc=frame.contentDocument;}catch{continue;}
   if(doc===binding.document)continue;
   this.unbindBufferDocument(binding);binding.document=doc;
   for(const event of ['selectionchange','mouseup','keyup'])doc?.addEventListener(event,binding.capture);
  }
 }
 private unbindBufferDocument(binding:BufferBinding):void{
  for(const event of ['selectionchange','mouseup','keyup'])binding.document?.removeEventListener(event,binding.capture);
 }
 private bufferStillValid():boolean{
  const buffer=this.bufferSelection;if(!buffer)return true;
  try{return buffer.frame.isConnected&&buffer.frame.contentDocument===buffer.document&&buffer.range.startContainer.isConnected&&buffer.range.endContainer.isConnected&&buffer.range.toString()===buffer.text;}catch{return false;}
 }
 private clearSelection(reason?:string):void{
  this.remembered=null;this.range=null;this.bufferSelection=null;this.selectionIssue=reason;this.onChange();
 }
 private rememberRange(range:Range,text:string,buffer:BufferSelection|null=null):boolean{
  const root=this.getRoot(),startEl=this.blockElement(range.startContainer),endEl=this.blockElement(range.endContainer);
  if(!root||!startEl||!endEl||!root.contains(startEl)||!root.contains(endEl)){
   this.clearSelection('일반 본문의 글자를 다시 선택해 주세요.');return false;
  }
  const snapshot=this.read(),startId=this.id(startEl),endId=this.id(endEl);
  if(!snapshot.blocks.some(b=>b.id===startId)||!snapshot.blocks.some(b=>b.id===endId)){
   this.clearSelection('일반 본문의 글자를 다시 선택해 주세요.');return false;
  }
  this.range=range.cloneRange();this.bufferSelection=buffer;this.selectionIssue=undefined;
  this.remembered={blockId:startId,endBlockId:endId,start:this.offset(startEl,range.startContainer,range.startOffset),end:this.offset(endEl,range.endContainer,range.endOffset),text,signature:this.selectionSignature(snapshot.blocks,startId,endId),valid:true,collapsed:range.collapsed};
  this.onChange();return true;
 }
 private captureBufferSelection(frame:HTMLIFrameElement):boolean{
  let doc:Document|null=null;try{doc=frame.contentDocument;}catch{return false;}
  const body=doc?.body,selection=doc?.defaultView?.getSelection();
  // Only the observed public input buffer is supported; unrelated editable frames are ignored.
  if(!body||body.getAttribute('contenteditable')!=='true'||!selection?.rangeCount)return false;
  // A native caret uses a completely empty input body, without the selection
  // marker. Keep its command range in that frame rather than the rendered DOM.
  const marked=!!body.querySelector('[data-input-buffer]'),emptyCaret=!body.hasChildNodes()&&selection.isCollapsed;
  if(!marked&&!emptyCaret)return false;
  const nativeRange=selection.getRangeAt(0);
  if(!body.contains(nativeRange.startContainer)||!body.contains(nativeRange.endContainer))return false;
  if(nativeRange.collapsed){
   const visible=window.getSelection(),root=this.getRoot();
   const visibleRange=visible?.rangeCount?visible.getRangeAt(0):null;
   const paragraph=visibleRange&&root?.contains(visibleRange.startContainer)?this.blockElement(visibleRange.startContainer):this.clickedParagraph;
   let range=paragraph?.isConnected&&root?.contains(paragraph)?visibleRange??this.rangeAt(this.id(paragraph),0):null;
   if(emptyCaret||document.querySelector('.se-selection div.se-caret')){
    // Arrow keys can move the native caret to another (including empty)
    // paragraph while the rendered DOM Selection stays at the old click.
    const snapshot=this.read(),candidates=snapshot.blocks.filter(b=>['paragraph','heading','quote'].includes(b.kind)&&!this.elements.get(b.id)?.closest('.se-cite'));
    const matches=candidates.flatMap(block=>{const mapped=this.nativeCaretRange(this.elements.get(block.id)!,block);return mapped?[mapped]:[];});
    if(matches.length!==1){this.clearSelection('네이버 커서 위치를 확인하지 못했어요. 삽입할 본문 위치를 다시 클릭해 주세요.');return true;}
    range=matches[0];
   }
   if(range)this.rememberRange(range,'',{frame,document:doc!,range:nativeRange.cloneRange(),text:''});
   else this.captureVisibleSelection();return true;
  }
  const inputRange=this.trimInputRange(body,nativeRange);
  const text=inputRange.toString(),visible=window.getSelection(),root=this.getRoot();
  if(!text||!visible?.rangeCount||!root){this.clearSelection('선택 위치를 확인하지 못했어요. 본문 글자를 다시 선택해 주세요.');return true;}
  const caret=visible.getRangeAt(0);
  const buffer:BufferSelection={frame,document:doc!,range:inputRange,text};
  // A multi-paragraph native buffer contains clipped copies of the rendered
  // paragraphs with their public DOM ids. Range.toString() joins these without
  // separators, so match each copy to its paragraph before restoring the range.
  const fragment=document.importNode(inputRange.cloneContents(),true),paragraphs=[...fragment.querySelectorAll<HTMLElement>(TEXT_SELECTOR)];
  if(paragraphs.length>1){this.captureParagraphBuffer(paragraphs,fragment,caret,buffer);return true;}
  const selectedText=this.runs(fragment).map(run=>run.text).join('');
  if(!caret.collapsed&&root.contains(caret.startContainer)&&root.contains(caret.endContainer)&&visible.toString()===text){
   this.rememberRange(caret,selectedText,buffer);return true;
  }
  const paragraph=this.blockElement(caret.startContainer);
  if(!caret.collapsed||!paragraph||!root.contains(paragraph)){
   this.clearSelection('선택 위치를 확인하지 못했어요. 본문 글자를 다시 선택해 주세요.');return true;
  }
  const snapshot=this.read(),block=snapshot.blocks.find(b=>this.elements.get(b.id)===paragraph);
  if(!block){this.clearSelection('일반 본문의 글자를 다시 선택해 주세요.');return true;}
  const anchor=this.offset(paragraph,caret.startContainer,caret.startOffset),matches:number[]=[];
  const plain=(value:string)=>value.replace(/\u00a0/gu,' '),source=plain(block.text),needle=plain(selectedText);
  if(!needle){this.clearSelection('본문 글자를 다시 선택해 주세요.');return true;}
  for(let at=source.indexOf(needle);at>=0;at=source.indexOf(needle,at+1))if(at<=anchor&&anchor<=at+needle.length)matches.push(at);
  if(matches.length!==1){
   this.clearSelection('선택 위치가 모호해요. 본문 글자를 다시 선택해 주세요.');return true;
  }
  const mapped=this.rangeAt(block.id,matches[0]),end=this.rangeAt(block.id,matches[0]+needle.length);
  mapped.setEnd(end.startContainer,end.startOffset);this.rememberRange(mapped,block.text.slice(matches[0],matches[0]+needle.length),buffer);return true;
 }
 private captureParagraphBuffer(paragraphs:HTMLElement[],fragment:DocumentFragment,caret:Range,buffer:BufferSelection):void{
  const snapshot=this.read(),plain=(value:string)=>value.replace(/\u00a0/gu,' ');
  const copies=paragraphs.map(paragraph=>({paragraph,text:this.runs(paragraph).map(run=>run.text).join(''),block:snapshot.blocks.find(block=>paragraph.id&&this.elements.get(block.id)?.id===paragraph.id)}));
  const first=copies[0],last=copies.at(-1)!;
  const from=snapshot.blocks.findIndex(block=>block.id===first.block?.id),to=snapshot.blocks.findIndex(block=>block.id===last.block?.id);
  const valid=from>=0&&to>=from&&to-from+1===copies.length&&copies.every((copy,index)=>copy.block?.id===snapshot.blocks[from+index]?.id&&['paragraph','heading','quote'].includes(copy.block!.kind));
  const payload=this.runs(fragment).map(run=>run.text).join('');
  if(!valid||payload!==copies.map(copy=>copy.text).join('')){this.clearSelection('본문 문단만 이어서 드래그해 주세요.');return;}
  const start=first.block!.text.length-first.text.length,end=last.text.length;
  if(start<0||end>last.block!.text.length||!copies.every((copy,index)=>plain(copy.text)===plain(copy.block!.text.slice(index===0?start:0,index===copies.length-1?end:copy.block!.text.length)))){
   this.clearSelection('선택한 문단 내용이 달라졌어요. 본문을 다시 드래그해 주세요.');return;
  }
  const anchor=this.blockElement(caret.startContainer),anchorIndex=copies.findIndex(copy=>this.elements.get(copy.block!.id)===anchor);
  const anchorOffset=anchor?this.offset(anchor,caret.startContainer,caret.startOffset):-1;
  if(anchorIndex<0||anchorOffset<(anchorIndex===0?start:0)||anchorOffset>(anchorIndex===copies.length-1?end:copies[anchorIndex].block!.text.length)){
   this.clearSelection('선택 위치를 확인하지 못했어요. 본문을 다시 드래그해 주세요.');return;
  }
  const mapped=this.rangeAt(first.block!.id,start),finish=this.rangeAt(last.block!.id,end);mapped.setEnd(finish.startContainer,finish.startOffset);
  this.rememberRange(mapped,copies.map((copy,index)=>copy.block!.text.slice(index===0?start:0,index===copies.length-1?end:copy.block!.text.length)).join('\n'),buffer);
 }
 private trimInputRange(body:HTMLElement,nativeRange:Range):Range{
  const doc=body.ownerDocument,inputRange=nativeRange.cloneRange(),marker=body.querySelector('[data-input-buffer]');
  // SmartEditor places a FEFF sentinel before its empty input marker. Keyboard
  // line selection includes that sentinel; it is not part of the rendered text.
  // Trim that exact DOM prefix, never FEFF characters in the user's own text.
  const sentinel=marker?.previousSibling;
  if(marker?.parentNode===body&&!marker.hasChildNodes()&&sentinel===body.firstChild&&sentinel?.nodeType===Node.TEXT_NODE&&sentinel.textContent==='\uFEFF'){
   const boundary=doc!.createRange();boundary.setStartAfter(marker);boundary.collapse(true);
   if(inputRange.compareBoundaryPoints(Range.START_TO_START,boundary)<0&&inputRange.compareBoundaryPoints(Range.END_TO_END,boundary)>0)inputRange.setStartAfter(marker);
   // Rich selections also have a standalone closing sentinel outside their
   // payload spans. Text inside a payload span, including FEFF, stays intact.
   const suffix=body.lastChild;
   if(suffix?.nodeType===Node.TEXT_NODE&&suffix.textContent==='\uFEFF'&&suffix.previousSibling?.nodeType===Node.ELEMENT_NODE&&suffix.previousSibling!==marker){
    const end=doc!.createRange();end.setStartBefore(suffix);end.collapse(true);
    if(inputRange.compareBoundaryPoints(Range.START_TO_START,end)<0&&inputRange.compareBoundaryPoints(Range.END_TO_END,end)>0)inputRange.setEndBefore(suffix);
   }
  }
  return inputRange;
 }
 /** Bind a newly inserted title only after its body offsets and native selection agree. */
 captureExpectedInputSelection(blockId:string,start:number,end:number):boolean{
  const snapshot=this.read(),block=snapshot.blocks.find(b=>b.id===blockId),doc=this.commandDocument();
  const frame=[...this.bufferFrames.keys()].find(frame=>{try{return frame.contentDocument===doc;}catch{return false;}}),native=doc.defaultView?.getSelection();
  if(!block||start<0||end<=start||end>block.text.length||!frame||!native?.rangeCount||native.isCollapsed||!doc.body.querySelector('[data-input-buffer]'))return false;
  const nativeRange=native.getRangeAt(0);if(!doc.body.contains(nativeRange.startContainer)||!doc.body.contains(nativeRange.endContainer))return false;
  const selected=this.trimInputRange(doc.body,nativeRange),text=selected.toString(),expected=block.text.slice(start,end);
  if(text.replace(/\u00a0/gu,' ')!==expected.replace(/\u00a0/gu,' '))return false;
  const mapped=this.rangeAt(blockId,start),finish=this.rangeAt(blockId,end);mapped.setEnd(finish.startContainer,finish.startOffset);
  return this.rememberRange(mapped,expected,{frame,document:doc,range:selected,text});
 }
 private captureVisibleSelection():void{
  const selection=window.getSelection();if(!selection?.rangeCount)return;
  const range=selection.getRangeAt(0),root=this.getRoot();if(!root)return;
  if(!root.contains(range.startContainer)&&!root.contains(range.endContainer))return;
  this.rememberRange(range,selection.toString());
 }
 captureSelection():void{
  this.bindInputFrames();
  const active=document.activeElement;
  if(active?.tagName==='IFRAME'&&this.bufferFrames.has(active as HTMLIFrameElement)&&this.captureBufferSelection(active as HTMLIFrameElement))return;
  // Panel focus and main-document selection events must not overwrite a native
  // caret with the rendered DOM's stale click anchor after keyboard movement.
  const visible=window.getSelection();
  if(visible?.rangeCount&&visible.isCollapsed&&this.getRoot()?.contains(visible.getRangeAt(0).startContainer)&&document.querySelector('.se-selection div.se-caret')){
   for(const frame of this.bufferFrames.keys()){
    try{if(frame.contentDocument?.defaultView?.getSelection()?.rangeCount&&this.captureBufferSelection(frame))return;}catch{ /* Removed or cross-origin input frame. */ }
   }
  }
  this.captureVisibleSelection();
 }
 restoreSelection(requireText=false):Range{
  const snapshot=this.read();
  if(!snapshot.selection?.valid||!this.range||(requireText&&this.range.collapsed))throw new Error(snapshot.selectionIssue??(requireText?'적용할 글자를 본문에서 다시 선택해 주세요.':'삽입 위치를 본문에서 다시 선택해 주세요.'));
  if(this.bufferSelection){
   const buffer=this.bufferSelection,range=buffer.range.cloneRange();
   buffer.document.defaultView?.focus();buffer.document.body.focus();
   const selection=buffer.document.defaultView?.getSelection();selection?.removeAllRanges();selection?.addRange(range);return range;
  }
  const range=this.range.cloneRange();this.blockElement(range.startContainer)?.closest<HTMLElement>('[contenteditable="true"]')?.focus();
  const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);return range;
 }
 commandDocument():Document{
  if(this.bufferSelection&&this.bufferStillValid())return this.bufferSelection.document;
  for(const frame of this.bufferFrames.keys()){
   try{const doc=frame.contentDocument,selection=doc?.defaultView?.getSelection();if(doc?.body.getAttribute('contenteditable')==='true'&&(doc.body.querySelector('[data-input-buffer]')||!doc.body.hasChildNodes()&&!!selection?.rangeCount&&selection.isCollapsed))return doc;}catch{ /* Removed or cross-origin input frame. */ }
  }
  return document;
 }
 private nativeCaretRange(paragraph:HTMLElement,block?:Block):Range|null{
  // The visible DOM Selection stays at the old click after keyboard movement.
  // The public caret overlay is updated by the native editor. Match its rendered
  // position to one unique text boundary, including after focus leaves the editor.
  const carets=[...document.querySelectorAll<HTMLElement>('.se-selection div.se-caret')];
  if(carets.length!==1)return null;
  const caret=carets[0],left=parseFloat(caret.style.left),top=parseFloat(caret.style.top),height=parseFloat(caret.style.height),parent=caret.parentElement;
  if(!parent||![left,top,height].every(Number.isFinite)||height<=0)return null;
  const origin=parent.getBoundingClientRect(),x=origin.left+left,y=origin.top+top;
  const id=this.id(paragraph);block??=this.read().blocks.find(b=>b.id===id);if(!block)return null;
  const bounds=paragraph.getBoundingClientRect();
  if(bounds.height>0&&(y+height<bounds.top-2||y>bounds.bottom+2))return null;
  // Empty native paragraphs have no text rectangle. Their sole logical
  // position is zero; validate it against the editor's public caret and line.
  if(!block.text&&bounds.height>0&&x>=bounds.left-2&&x<=bounds.right+2&&y>=bounds.top-2&&y+height<=bounds.bottom+2)return this.rangeAt(id,0);
  const matches:Range[]=[];
  for(let offset=0;offset<=block.text.length;offset++){
   const range=this.rangeAt(id,offset),rects=[...range.getClientRects()];
   if(rects.some(rect=>rect.height>0&&Math.abs(rect.left-x)<=1.5&&Math.abs(rect.top-y)<=1.5))matches.push(range);
  }
  return matches.length===1?matches[0]:null;
 }
 rangeAt(blockId:string,offset:number):Range{
  const element=this.elements.get(blockId);if(!element?.isConnected)throw new Error('문단 위치가 달라졌어요. 다시 선택해 주세요.');
  const range=document.createRange();const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:node=>{
   if(node instanceof Element&&(node.matches(IGNORED_SELECTOR)||['SCRIPT','STYLE','NOSCRIPT','BUTTON'].includes(node.tagName)))return NodeFilter.FILTER_REJECT;
   return node.nodeType===Node.TEXT_NODE||node instanceof HTMLBRElement?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
  }});let left=offset;let node:Node|null;
  while((node=walker.nextNode())){if(node instanceof HTMLBRElement){if(left===0){range.setStartBefore(node);range.collapse(true);return range;}left--;continue;}const len=node.textContent?.length??0;if(left<=len){range.setStart(node,left);range.collapse(true);return range;}left-=len;}
  if(left>0)throw new Error('문단 안의 위치를 찾을 수 없어요.');range.selectNodeContents(element);range.collapse(false);return range;
 }
 async selectAt(blockId:string,offset:number,guard:()=>void=()=>{}):Promise<void>{
  guard();
  const snapshot=this.read(),selection=snapshot.selection,source=snapshot.blocks.find(block=>block.id===blockId);let element=this.elements.get(blockId);if(!element)throw new Error('문단을 다시 선택해 주세요.');const nativeId=element.id;
  if(selection?.valid&&selection.collapsed&&selection.blockId===blockId&&selection.endBlockId===blockId&&selection.start===offset){
   if(!this.bufferFrames.size){this.restoreSelection();return;}
   const doc=this.commandDocument(),native=doc.defaultView?.getSelection(),actual=this.nativeCaretRange(element);
   if(native?.rangeCount&&native.isCollapsed&&actual&&this.offset(element,actual.startContainer,actual.startOffset)===offset){doc.body.focus();return;}
  }
  if(this.bufferFrames.size){
   element.scrollIntoView({block:'center'});const range=this.rangeAt(blockId,offset),rect=range.getClientRects()[0],view=document.defaultView;
   if(!rect||rect.height<=0||!view)throw new Error('문단의 실제 커서 위치를 확인하지 못했어요.');
   const target=range.startContainer.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:element;
   if(!target)throw new Error('문단을 다시 선택해 주세요.');
   for(const type of ['mousedown','mouseup','click'])target.dispatchEvent(new view.MouseEvent(type,{bubbles:true,cancelable:true,view,button:0,buttons:type==='mousedown'?1:0,clientX:rect.left+0.25,clientY:rect.top+rect.height/2}));
   const deadline=Date.now()+1200;let failure='네이버 커서가 요청 위치로 이동하지 않았어요. 본문을 변경하지 않습니다.',arrowSent=false,matchedAt:number|undefined;
   while(Date.now()<deadline){
    guard();const current=this.read();
    if(current.sessionId!==snapshot.sessionId||current.documentKey!==snapshot.documentKey||current.revision!==snapshot.revision)throw new Error('커서 이동 중 본문이나 문단이 바뀌었어요. 본문을 변경하지 않습니다.');
    if(!element.isConnected){
     const matches=nativeId?current.blocks.filter(block=>this.elements.get(block.id)?.id===nativeId):[];
     if(matches.length!==1||!source||blockSignature(matches[0])!==blockSignature(source))throw new Error('커서 이동 중 문단 위치를 다시 확인하지 못했어요. 본문을 변경하지 않습니다.');
     element=this.elements.get(matches[0].id)!;
    }
    const doc=this.commandDocument(),native=doc.defaultView?.getSelection();
    // A click may briefly leave the old input selection/caret in place. Wait
    // rather than treating the first asynchronous frame as a permanent failure.
    if(native?.rangeCount&&!native.isCollapsed){
     const selected=this.trimInputRange(doc.body,native.getRangeAt(0)).toString().replace(/\u00a0/gu,' '),text=snapshot.blocks.find(block=>block.id===blockId)!.text.replace(/\u00a0/gu,' ');
     const start=!!selected&&text.slice(offset,offset+selected.length)===selected,end=!!selected&&offset>=selected.length&&text.slice(offset-selected.length,offset)===selected;
     failure='네이버 입력 영역의 선택을 요청한 커서 위치로 해제하지 못했어요. 본문을 변경하지 않습니다.';
     if(start!==end&&!arrowSent){
      const key=start?'ArrowLeft':'ArrowRight',inputView=doc.defaultView!;doc.body.focus();
      const handled=!doc.body.dispatchEvent(new inputView.KeyboardEvent('keydown',{key,code:key,keyCode:start?37:39,which:start?37:39,bubbles:true,cancelable:true}));
      if(!handled)throw new Error('네이버 입력 영역의 선택을 해제하지 못했어요. 본문을 변경하지 않습니다.');
      arrowSent=true;
     }
     matchedAt=undefined;
    }else if(native?.rangeCount&&native.isCollapsed){
     failure='네이버 커서가 요청 위치로 이동하지 않았어요. 본문을 변경하지 않습니다.';
     const actual=this.nativeCaretRange(element);
     if(actual&&this.offset(element,actual.startContainer,actual.startOffset)===offset){
      matchedAt??=Date.now();if(Date.now()-matchedAt>=40){this.captureSelection();return;}
     }else matchedAt=undefined;
    }else{matchedAt=undefined;failure='네이버 입력 영역의 요청 위치 커서를 확인하지 못했어요. 본문을 변경하지 않습니다.';}
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   throw new Error(failure);
  }
  const range=this.rangeAt(blockId,offset);element.closest<HTMLElement>('[contenteditable="true"]')?.focus();const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range);this.captureSelection();
 }
 async selectParagraph(blockId:string):Promise<void>{
  const snapshot=this.read(),block=snapshot.blocks.find(b=>b.id===blockId),selection=snapshot.selection;
  if(!block||!['paragraph','heading','quote'].includes(block.kind)||!block.text.trim())throw new Error('글자가 있는 문단을 클릭해 주세요.');
  if(selection?.valid&&selection.blockId===blockId&&selection.endBlockId===blockId&&selection.start===0&&selection.end===block.text.length){this.restoreSelection(true);return;}
  if(this.bufferFrames.size){
   await this.selectAt(blockId,block.text.length);
   const doc=this.commandDocument(),view=doc.defaultView;
   if(!view||doc.body.getAttribute('contenteditable')!=='true')throw new Error('네이버 문단 선택 위치를 확인하지 못했어요.');
   doc.body.focus();
   for(const _ of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(block.text)){
    const handled=!doc.body.dispatchEvent(new view.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',keyCode:37,which:37,shiftKey:true,bubbles:true,cancelable:true}));
    if(!handled)throw new Error('문단을 선택하지 못했어요. 본문에서 문단을 다시 클릭해 주세요.');
   }
   await new Promise(r=>setTimeout(r,60));
   if(!this.captureExpectedInputSelection(blockId,0,block.text.length))throw new Error('한 문단 전체를 선택했는지 확인하지 못했어요. 문단을 다시 클릭해 주세요.');
   this.restoreSelection(true);return;
  }
  const range=this.rangeAt(blockId,0),end=this.rangeAt(blockId,block.text.length);range.setEnd(end.startContainer,end.startOffset);
  if(!this.rememberRange(range,block.text))throw new Error('문단을 다시 클릭해 주세요.');
  this.restoreSelection(true);
 }
 async selectParagraphs(firstId:string,lastId:string):Promise<void>{
  if(firstId===lastId){await this.selectParagraph(firstId);return;}
  const snapshot=this.read(),from=snapshot.blocks.findIndex(block=>block.id===firstId),to=snapshot.blocks.findIndex(block=>block.id===lastId),blocks=snapshot.blocks.slice(from,to+1);
  if(from<0||to<from||blocks.some(block=>!['paragraph','heading','quote'].includes(block.kind)))throw new Error('본문 문단만 이어서 드래그해 주세요.');
  const last=blocks.at(-1)!,text=blocks.map(block=>block.text).join('\n');
  if(snapshot.selection?.valid&&snapshot.selection.blockId===firstId&&snapshot.selection.endBlockId===lastId&&snapshot.selection.start===0&&snapshot.selection.end===last.text.length){this.restoreSelection(true);return;}
  if(this.bufferFrames.size){
   await this.selectAt(last.id,last.text.length);
   const doc=this.commandDocument(),view=doc.defaultView;if(!view||doc.body.getAttribute('contenteditable')!=='true')throw new Error('네이버 문단 선택 위치를 확인하지 못했어요.');
   doc.body.focus();
   for(const _ of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
    const handled=!doc.body.dispatchEvent(new view.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',keyCode:37,which:37,shiftKey:true,bubbles:true,cancelable:true}));
    if(!handled)throw new Error('문단을 선택하지 못했어요. 본문을 다시 드래그해 주세요.');
   }
   await new Promise(r=>setTimeout(r,60));this.captureSelection();
   const selection=this.read().selection;
   if(!selection?.valid||selection.blockId!==firstId||selection.endBlockId!==lastId||selection.start!==0||selection.end!==last.text.length)throw new Error('문단 전체 선택을 확인하지 못했어요. 본문을 다시 드래그해 주세요.');
   this.restoreSelection(true);return;
  }
  const range=this.rangeAt(firstId,0),end=this.rangeAt(lastId,last.text.length);range.setEnd(end.startContainer,end.startOffset);
  if(!this.rememberRange(range,text))throw new Error('본문을 다시 드래그해 주세요.');this.restoreSelection(true);
 }
 dispose():void{this.disposed=true;for(const [frame,binding] of this.bufferFrames){this.unbindBufferDocument(binding);frame.removeEventListener('load',binding.load);}this.bufferFrames.clear();this.observer.disconnect();if(this.timer)clearTimeout(this.timer);if(this.selectionTimer)clearTimeout(this.selectionTimer);document.removeEventListener('selectionchange',this.selectionListener);document.removeEventListener('mousedown',this.selectionListener);document.removeEventListener('mouseup',this.selectionListener);document.removeEventListener('keyup',this.selectionListener);}
}
