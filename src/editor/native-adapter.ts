import type { EditorRequest, EditorResponse, Snapshot, Block } from '../core/types';
import {enablePhotoAi,restorePhotoAi} from './photo-ai';
import {photoAiContent,photoAiStatus} from '../core/photo-ai';
import { EditorReader } from './reader';
import { PublicEditorUI, PendingNativeImportError, PendingNativeLinebreakError } from './public-ui';
import { verifyPostconditions, verifyPhotoAddition, verifyPhotoMove, photoImageCount } from './postconditions';
import {decodePhotoFiles} from '../core/photo-upload';
import {PublishTimeUI} from './publish-time';
import {validatePublishTime} from '../core/schedule';
import { blockSignature } from '../core/hash';
import {applyNativeLinebreaks} from './linebreak';
import {PendingNativeEditError} from './native-operation';
import {withinUndoBoundary} from './undo-boundary';
import { loadDatabase } from '../platform/storage';
import { canonicalPost, validatePost } from '../core/security';
import {assertNaverFormat} from '../core/naver-format-options';
import {loadCardReferences,saveCardReference} from '../platform/link-card-cache';
export class NativeAdapter {
 private busy=false;
 private undoCount=0;
 private undoAi=false;
 private undoBefore:string|null=null;
 private undoBaseline:Snapshot|null=null;
 private undoExpected:string|null=null;
 private unsafe=false;
 private unsafeIssue='이전 작업의 복원을 확인하지 못했어요. 복구 안내에서 본문을 확인하고 임시저장해 주세요.';
 private uploadBefore:Snapshot|null=null;
 private uploadTarget:{targetId:string;placement:'before'|'after';count:number;startedAt:number}|null=null;
 private loadedCards:Promise<void>|null=null;
 private photoPreparation:Promise<void>|null=null;
 private photoPreparationKey='';
 private photoPreparationIssue:string|undefined;
 readonly reader=new EditorReader();
 private ui=new PublicEditorUI(this.reader,()=>this.undoCount++);
 private preparePhotos(snapshot:Snapshot):void{
  const root=this.reader.getRoot(),controller=new AbortController();let restoreScroll=true;
  const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
  const interaction=(event:Event)=>{if(!event.isTrusted)return;if(event.type!=='keydown'&&event.type!=='input')restoreScroll=false;controller.abort();};
  const events=['wheel','mousedown','touchstart','keydown','input'];
  for(const doc of docs)for(const type of events)doc.addEventListener(type,interaction,true);
  this.photoPreparationIssue=undefined;
  // Defer until the caller has received the pending state. Parallel refreshes
  // share one scan, and the scan never changes selection or editor content.
  this.photoPreparation=Promise.resolve().then(async()=>{
   if(this.reader.getRoot()!==root||this.reader.read().documentKey!==snapshot.documentKey)return;
   await this.reader.loadPendingPhotos(12_000,{signal:controller.signal,restoreScroll:()=>restoreScroll});
  }).catch(error=>{this.photoPreparationIssue=error instanceof Error?error.message:'사진 정보를 확인하지 못했어요.';}).finally(()=>{
   for(const doc of docs)for(const type of events)doc.removeEventListener(type,interaction,true);
   this.photoPreparation=null;this.reader.onChange();
  });
 }
 async snapshot(retryMedia=false):Promise<Snapshot>{
  this.loadedCards??=loadCardReferences().then(references=>this.reader.seedCardReferences(references));await this.loadedCards;
  const snapshot=this.reader.read();snapshot.capabilities=['publish-time','photo-ai-on'];snapshot.publishTime=new PublishTimeUI().read();
  const mediaKey=JSON.stringify(snapshot.blocks.filter(block=>block.photo).map(block=>block.id));
  if(!snapshot.mediaPending){this.photoPreparationKey='';this.photoPreparationIssue=undefined;}
  if(snapshot.editable&&snapshot.mediaPending&&!snapshot.uploadBusy&&!this.uploadBefore&&!this.busy&&!this.unsafe&&!this.photoPreparation&&(retryMedia||mediaKey!==this.photoPreparationKey)){
   this.photoPreparationKey=mediaKey;this.preparePhotos(snapshot);
  }
  snapshot.mediaPreparing=!!this.photoPreparation;snapshot.mediaIssue=this.photoPreparationIssue;
  snapshot.canUndo=!this.unsafe&&!!this.undoBefore&&this.undoCount>0&&this.undoExpected===snapshot.revision;
  if(this.uploadBefore&&this.uploadTarget&&!snapshot.uploadBusy&&!snapshot.mediaPending&&photoImageCount(snapshot.blocks)>=photoImageCount(this.uploadBefore.blocks)+this.uploadTarget.count){
   try{
    verifyPhotoAddition(this.uploadBefore,snapshot,this.uploadTarget,this.uploadTarget.count);
    this.undoBefore=this.uploadBefore.revision;this.undoBaseline=this.uploadBefore;this.undoCount=this.uploadTarget.count;this.undoAi=false;this.undoExpected=snapshot.revision;
    this.uploadBefore=null;this.uploadTarget=null;
   }catch(error){this.unsafe=true;this.unsafeIssue=(error instanceof Error?error.message:'사진 추가 결과를 확인하지 못했어요.')+' 복구 안내에서 사진과 본문을 확인하고 임시저장해 주세요.';this.uploadBefore=null;this.uploadTarget=null;this.undoBefore=null;this.undoExpected=null;this.undoCount=0;}
  }
  if(this.uploadTarget&&Date.now()-this.uploadTarget.startedAt>120_000){
   this.unsafe=true;this.unsafeIssue='사진 업로드 완료를 확인하지 못했어요. 복구 안내에서 사진과 본문을 확인하고 임시저장해 주세요.';
   this.uploadBefore=null;this.uploadTarget=null;this.undoBefore=null;this.undoExpected=null;this.undoCount=0;
  }
  snapshot.uploadPending=!!this.uploadBefore;snapshot.uploadBusy=snapshot.uploadBusy||!!this.uploadBefore;
  snapshot.canUndo=!this.unsafe&&!!this.undoBefore&&this.undoCount>0&&this.undoExpected===snapshot.revision;
  if(this.unsafe)snapshot.issue=this.unsafeIssue;
  return snapshot;
 }
 private photos(blocks:Block[]):string{return JSON.stringify(blocks.filter(b=>b.kind==='photo').map(b=>JSON.stringify({photo:b.photo,structure:b.structure})).sort());}
 private undoContent(snapshot:Snapshot,baseline:Snapshot):string{
  const text=snapshot.blocks.filter(block=>['paragraph','heading','quote','table','list','code'].includes(block.kind)).map(block=>block.text.replace(/\s/gu,'')).join('');
  const sources=(block:Block)=>block.photo?.items?.map(item=>item.src)??(block.photo?[block.photo.src]:[]);
  const originals=new Set(baseline.blocks.filter(block=>block.kind==='photo').flatMap(sources));
  const photos=snapshot.blocks.filter(block=>block.kind==='photo'&&sources(block).some(src=>originals.has(src)));
  // A native group move can have separate split/rejoin history transactions.
  // Protect original image files and caption text at every intermediate step;
  // the final revision still requires the exact original group and formatting.
  const images=photos.flatMap(sources).filter(src=>originals.has(src)).sort();
  const captions=photos.flatMap(block=>{const caption=block.photo!.caption.replace(/\u00a0/gu,' ');return caption?[JSON.stringify({src:sources(block)[0],caption})]:[];}).sort();
  return JSON.stringify({title:snapshot.title,text,images,captions});
 }
 private async revert(expected:string,count:number,baseline:Snapshot,guard:()=>void=()=>{}):Promise<boolean>{
  // Observed font/colour actions can create an extra native history transaction.
  // Always stop at the saved baseline, including between invisible transactions.
  let previous=this.reader.read();const start=previous,content=this.undoContent(baseline,baseline);
  for(let i=0;i<count*2;i++){
   guard();if(previous.revision===expected)return true;if(!await this.ui.undo(guard))return false;
   try{await this.reader.loadPendingPhotos();}catch{return false;}
   const current=this.reader.read(),candidate=this.undoContent(current,baseline);
   // A stale native/UI representation must not make extra undo attempts eat
   // an earlier caption edit or whole-body paste. Redo the out-of-range step.
   if(candidate!==content&&candidate!==this.undoContent(previous,baseline)||!withinUndoBoundary(baseline,start,current)){await this.ui.redo(guard);return false;}
   previous=current;
  }
  return this.reader.read().revision===expected;
 }
 async handle(request:EditorRequest):Promise<EditorResponse>{
  let before:Snapshot|undefined;let mutating=false,ownsBusy=false;
  let photoMoveInterrupted=false,linebreakInterrupted=false,formatInterrupted=false,formatGuard:(()=>void)|undefined,releaseMutationGuard:(()=>void)|undefined;
  let previousJournal:{ai:boolean;count:number;before:string|null;expected:string|null;baseline:Snapshot|null}|undefined;
  try{
   if(!['snapshot','focus','format','link','photo-add','photo-move','photo-add-cancel','linebreak','undo','publish-time','photo-ai-on'].includes(request.type))throw new Error('지원하지 않는 편집 요청이에요.');
   if(request.type==='snapshot')return {ok:true,snapshot:await this.snapshot(request.retryMedia)};
   if(this.photoPreparation)await this.photoPreparation;
   if(request.type==='focus'){this.reader.read();const target=this.reader.elements.get(request.blockId);if(!target?.isConnected)throw new Error('문단을 다시 선택해 주세요.');target.scrollIntoView({block:'center',behavior:'smooth'});return {ok:true,snapshot:await this.snapshot()};}
   if(this.busy)throw new Error('진행 중인 작업이 끝날 때까지 기다려 주세요.');
   // Native keyboard events can precede the caret overlay update. Refresh the
   // insertion bookmark from the settled public caret before choosing a target.
   if(request.type==='link')this.reader.captureSelection();
   before=await this.snapshot();if(!before.editable)throw new Error('PC 네이버 글쓰기에서 실행해 주세요.');
   if(this.photoPreparation){await this.photoPreparation;before=await this.snapshot();}
   if(this.unsafe)throw new Error(this.unsafeIssue);
   if(request.type==='undo'){
    if(!this.undoExpected||before.revision!==this.undoExpected||!this.undoBefore||!this.undoCount)throw new Error('본문 상태가 달라져 안전하게 되돌릴 수 없어요.');
    this.busy=true;ownsBusy=true;const expected=this.undoBefore;
    if(this.undoAi&&this.undoBaseline){
     let interrupted=false;const interaction=(event:Event)=>{if(event.isTrusted)interrupted=true;};
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','input'])doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','input'])doc.removeEventListener(type,interaction,true);};
     try{await restorePhotoAi(this.reader,this.undoBaseline,()=>{if(interrupted)throw new Error('직접 편집한 내용이 있어 AI 활용 설정 복원을 멈췄어요.');});}
     catch(error){this.undoExpected=null;this.undoCount=0;this.undoAi=false;throw error;}
    }else{
     let interrupted=false;const interaction=(event:Event)=>{if(event.isTrusted)interrupted=true;};
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','compositionstart'])doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','compositionstart'])doc.removeEventListener(type,interaction,true);};
     if(!await this.revert(expected,this.undoCount,this.undoBaseline??before,()=>{if(interrupted)throw new PendingNativeEditError('되돌리기 중 직접 편집한 내용이 있어 작업을 멈췄어요.');})){this.unsafe=true;throw new Error('서식과 사진을 포함한 정확한 복원을 확인하지 못했어요.');}
    }
    this.undoBefore=null;this.undoBaseline=null;this.undoExpected=null;this.undoCount=0;this.undoAi=false;this.reader.captureSelection();return {ok:true,snapshot:await this.snapshot()};
   }
   if(request.type==='photo-add-cancel'){
    if(this.uploadBefore)throw new Error('사진을 네이버에 전달했어요. 업로드가 끝날 때까지 기다려 주세요.');
    return {ok:true,snapshot:await this.snapshot()};
   }
   if(before.uploadBusy)throw new Error('사진 업로드가 끝난 뒤 다시 실행해 주세요.');
   if(before.mediaPending&&request.type!=='publish-time'&&request.type!=='photo-ai-on')throw new Error('사진 자동 확인이 완료되지 않았어요. 도우미의 사진 다시 확인을 눌러 주세요.');
   if(request.type==='publish-time'){
    const value=validatePublishTime(request.value),expected=request.expected;
    if(!expected||expected.sessionId!==before.sessionId||expected.documentKey!==before.documentKey||expected.revision!==before.revision)throw new Error('본문이나 편집 탭이 바뀌었어요. 예약 날짜와 시간을 다시 확인해 주세요.');
    const original=before;let interrupted=false;
    const interaction=(event:Event)=>{if(event.isTrusted)interrupted=true;};
    const guard=()=>{
     const current=this.reader.read();
     if(interrupted||current.sessionId!==original.sessionId||current.documentKey!==original.documentKey||current.revision!==original.revision)throw new Error('예약 설정 중 글이나 네이버 화면이 바뀌었어요. 현재 설정을 확인한 뒤 다시 실행해 주세요.');
    };
    if(this.busy)throw new Error('진행 중인 작업이 끝날 때까지 기다려 주세요.');
    this.busy=true;ownsBusy=true;
    for(const type of ['mousedown','keydown','touchstart'])document.addEventListener(type,interaction,true);
    try{await new PublishTimeUI(guard).apply(value);guard();return {ok:true,snapshot:await this.snapshot()};}
    finally{for(const type of ['mousedown','keydown','touchstart'])document.removeEventListener(type,interaction,true);}
   }
   if(request.type==='photo-ai-on'){
    const expected=request.expected;
    if(!expected||expected.sessionId!==before.sessionId||expected.documentKey!==before.documentKey||expected.revision!==before.revision)throw new Error('본문이나 사진이 바뀌었어요. 사진 목록을 새로고침한 뒤 다시 실행해 주세요.');
    const status=photoAiStatus(before.blocks);
    if(status.total>0&&status.on===status.total)return {ok:true,snapshot:before,unchanged:true};
   }
   if(request.type==='format'){
    assertNaverFormat(request.preset.format);
    if(request.preset.format.paragraphStyle===undefined||request.preset.format.paragraphStyle==='quote'){
     let matches=false;try{verifyPostconditions(before,before,request);matches=true;}catch{}
     if(matches)return {ok:true,snapshot:before,unchanged:true};
    }
   }
   if(request.type==='photo-move'){
    if(!['before','after'].includes(request.placement))throw new Error('사진을 넣을 문단 앞·뒤를 선택해 주세요.');
    let matches=false;try{verifyPhotoMove(before,before,request);matches=true;}catch{}
    if(matches)return {ok:true,snapshot:before,unchanged:true};
   }
   let photoFiles:File[]|undefined;
   if(request.type==='photo-add'){
    if(!request.expected||request.expected.sessionId!==before.sessionId||request.expected.documentKey!==before.documentKey||request.expected.revision!==before.revision)throw new Error('사진을 선택하는 동안 본문이 바뀌었어요. 삽입 위치를 다시 선택해 주세요.');
    if(!['before','after'].includes(request.placement))throw new Error('사진을 넣을 문단 앞·뒤를 선택해 주세요.');
    photoFiles=decodePhotoFiles(request.files);
   }
   if(this.busy)throw new Error('진행 중인 작업이 끝날 때까지 기다려 주세요.');
   this.busy=true;ownsBusy=true;previousJournal={ai:this.undoAi,count:this.undoCount,before:this.undoBefore,expected:this.undoExpected,baseline:this.undoBaseline};this.undoCount=0;this.undoBefore=before.revision;this.undoBaseline=before;this.undoExpected=null;this.undoAi=request.type==='photo-ai-on';mutating=true;
   switch(request.type){
    case 'photo-ai-on':{
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     let interrupted=false;const interaction=(event:Event)=>{if(event.isTrusted)interrupted=true;};
     for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','input'])doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','input'])doc.removeEventListener(type,interaction,true);};
     await enablePhotoAi(this.reader,()=>this.undoCount++,()=>{if(interrupted)throw new Error('직접 편집한 내용이 있어 AI 활용 설정을 멈췄어요.');});
     break;
    }
    case 'format':{
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     const interaction=(event:Event)=>{if(event.isTrusted)formatInterrupted=true;};
     const events=['mousedown','keydown','touchstart','compositionstart','paste','cut'];
     for(const doc of docs)for(const type of events)doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of events)doc.removeEventListener(type,interaction,true);};
     const original=before,text=(snapshot:Snapshot)=>snapshot.blocks.map(block=>block.text==='\n'?'':block.text).join('').replace(/\u00a0/gu,' '),originalText=text(before),originalChars=Array.from(originalText);
     formatGuard=()=>{
      const current=this.reader.read(),value=text(current);
      if(current.sessionId!==original.sessionId||current.documentKey!==original.documentKey)formatInterrupted=true;
      if(value!==originalText){
       let matched=0;for(const char of value)if(char===originalChars[matched])matched++;
       if(matched===originalChars.length)formatInterrupted=true;
       if(!formatInterrupted)throw new Error('서식 적용 중 원문이 바뀌었어요.');
      }
      if(formatInterrupted)throw new Error('서식 적용 중 직접 편집한 내용이나 커서 이동이 있어 작업을 멈췄어요.');
     };
     await this.ui.format(request.preset.format,formatGuard);formatGuard();break;
    }
    case 'link':{
     const db=await loadDatabase(),post=validatePost(request.post,db.settings.blogUrl);
     if(before.linkedUrls.some(url=>{try{return canonicalPost(url).url===post.url;}catch{return false;}}))throw new Error('이 링크는 이미 본문에 있어요.');
     const range=this.reader.restoreSelection();if(!range.collapsed)throw new Error('기존 글자를 바꾸지 않도록 커서 위치를 클릭해 주세요.');
     const selection=before.selection!,source=before.blocks.find(b=>b.id===selection.blockId);if(!source||!['paragraph','heading'].includes(source.kind))throw new Error('미리보기 카드를 넣을 본문 문단을 선택해 주세요.');await this.reader.selectAt(selection.blockId,selection.start);await this.ui.insertLinkCard(post.url);break;
    }
    case 'linebreak':{
     const plan=request.plan;if(plan.revision!==before.revision||plan.documentKey!==before.documentKey||!plan.contentPreserved)throw new Error('미리보기 이후 본문이 바뀌었어요. 다시 미리보기해 주세요.');
     if(plan.rules.reflow)throw new Error('기존 줄바꿈 재정리와 문단 합치기는 아직 지원하지 않아요. 기존 줄바꿈 유지 옵션을 사용해 주세요.');
     const checks=plan.changes.map(c=>({change:c,block:before!.blocks.find(b=>b.id===c.blockId)}));
     if(checks.some(({change,block})=>!block||block.kind!=='paragraph'||blockSignature(block)!==change.sourceSignature))throw new Error('정리 대상 문단을 다시 선택해 주세요.');
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     const interaction=(event:Event)=>{if(event.isTrusted)linebreakInterrupted=true;};
     for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','compositionstart'])doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of ['mousedown','keydown','touchstart','compositionstart'])doc.removeEventListener(type,interaction,true);};
     const original=before,guard=()=>{
      const current=this.reader.read();
      if(linebreakInterrupted)throw new Error('줄바꿈 중 직접 편집한 내용이나 커서 이동이 있어 작업을 멈췄어요.');
      if(current.sessionId!==original.sessionId||current.documentKey!==original.documentKey)throw new Error('줄바꿈 중 편집 문서가 바뀌었어요.');
     };
     await applyNativeLinebreaks(this.reader,this.ui,before,plan,guard);
     break;
    }
    case 'photo-add':{
     const target=before.blocks.find(b=>b.id===request.targetId);if(!target||!['paragraph','heading'].includes(target.kind))throw new Error('사진을 넣을 문단을 선택해 주세요.');
     await this.reader.selectAt(target.id,request.placement==='before'?0:target.text.length);
     if(this.reader.read().revision!==before.revision)throw new Error('사진을 전달하기 전에 본문이 바뀌었어요. 삽입 위치를 다시 선택해 주세요.');
     this.uploadBefore=before;this.uploadTarget={targetId:target.id,placement:request.placement,count:photoFiles!.length,startedAt:Date.now()};
     this.undoBefore=null;await this.ui.uploadPhotos(photoFiles!);return {ok:true,snapshot:await this.snapshot()};
    }
    case 'photo-move':{
     const docs=[document,...[...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="input_buffer"]')].flatMap(frame=>{try{return frame.contentDocument?[frame.contentDocument]:[];}catch{return [];}})];
     const interaction=(event:Event)=>{if(event.isTrusted)photoMoveInterrupted=true;};
     for(const doc of docs)for(const type of ['mousedown','keydown','touchstart'])doc.addEventListener(type,interaction,true);
     releaseMutationGuard=()=>{for(const doc of docs)for(const type of ['mousedown','keydown','touchstart'])doc.removeEventListener(type,interaction,true);};
     const original=before;
     await this.ui.movePhoto(request,()=>{const current=this.reader.read();if(photoMoveInterrupted||current.sessionId!==original.sessionId||current.documentKey!==original.documentKey||current.revision!==original.revision)throw new Error('사진 이동 중 본문이나 선택 상태가 바뀌었어요. 네이버에서 사진 위치를 다시 확인해 주세요.');});
     break;
    }
   }
   await new Promise(r=>setTimeout(r,100));if(request.type!=='photo-ai-on')await this.reader.loadPendingPhotos();const after=await this.snapshot();if(request.type==='format')formatGuard?.();
   if(after.revision===before.revision)throw new Error('본문 변경을 확인하지 못했어요. 적용할 위치를 다시 선택해 주세요.');
   if(request.type==='photo-ai-on'?(photoAiContent(after)!==photoAiContent(before)||photoAiStatus(after.blocks).on!==photoAiStatus(after.blocks).total):this.photos(after.blocks)!==this.photos(before.blocks))throw new Error('사진·캡션·속성 보존을 확인하지 못했어요.');
   if(request.type==='photo-move'&&photoMoveInterrupted)throw new Error('사진 이동 중 직접 수정한 내용이 있어요. 네이버에서 사진 위치를 확인해 주세요.');
   verifyPostconditions(before,after,request);
   if(request.type==='link'){
    const url=canonicalPost(request.post.url).url,card=after.blocks.find(block=>block.kind==='link-card'&&block.linkCard?.url===url),reference=card?.componentId?this.reader.cardReference(card.componentId):undefined;
    if(reference)try{await saveCardReference(reference);}catch{ /* The live card and undo remain valid if its local URL cache cannot be saved. */ }
   }
   this.undoExpected=after.revision;after.canUndo=this.undoCount>0;
   return {ok:true,snapshot:after};
  }catch(error){
   if(request.type==='format'&&formatGuard)try{formatGuard();}catch(guardError){error=guardError;}
   let message=error instanceof Error?error.message:String(error);
   const uncertainLinebreak=request.type==='linebreak'&&(error instanceof PendingNativeLinebreakError||linebreakInterrupted);
   if(error instanceof PendingNativeEditError||(formatInterrupted||uncertainLinebreak)&&this.undoCount>0){this.unsafe=true;this.unsafeIssue=message+' 복구 안내에서 원고와 현재 설정을 확인하고 임시저장해 주세요.';message=this.unsafeIssue;}
   if(request.type==='link'&&(error instanceof PendingNativeImportError||mutating&&this.undoCount>0)){this.unsafe=true;this.unsafeIssue='링크 삽입 결과를 확인하지 못했어요. 복구 안내에서 본문을 확인하고 임시저장해 주세요.';}
   if(mutating&&request.type==='photo-add'){
    if(this.undoCount>0){this.unsafe=true;this.unsafeIssue='사진 전달 결과를 확인하지 못했어요. 복구 안내에서 사진과 본문을 확인하고 임시저장해 주세요.';}
    this.uploadBefore=null;this.uploadTarget=null;
   }
   if(mutating&&before&&previousJournal&&!this.unsafe&&(this.undoCount===0||request.type==='photo-move')&&this.reader.read().revision===before.revision){this.undoAi=previousJournal.ai;this.undoCount=previousJournal.count;this.undoBefore=previousJournal.before;this.undoExpected=previousJournal.expected;this.undoBaseline=previousJournal.baseline;}
   if(mutating&&before&&this.reader.read().revision!==before.revision){
    // A delayed native link result or user input can add history entries after
    // the request. Automatic undo could then consume the user's whole-body
    // paste or edits. Link failures must preserve the current document.
    const asynchronousImport=error instanceof PendingNativeEditError||formatInterrupted||uncertainLinebreak||request.type==='photo-ai-on'||request.type==='link'||request.type==='photo-add'||request.type==='photo-move'&&(photoMoveInterrupted||this.undoCount===0);
    let restored=false;
    try{if(!asynchronousImport)restored=await this.revert(before.revision,this.undoCount||1,before,()=>{if(formatInterrupted||linebreakInterrupted||photoMoveInterrupted)throw new PendingNativeEditError('복원 중 직접 편집한 내용이 있어 되돌리기를 멈췄어요.');});}
    catch(rollbackError){this.unsafe=true;message+=' '+(rollbackError instanceof Error?rollbackError.message:String(rollbackError));this.unsafeIssue=message+' 복구 안내에서 본문을 확인하고 임시저장해 주세요.';}

    this.undoBefore=null;this.undoBaseline=null;this.undoExpected=null;this.undoCount=0;
    if(!asynchronousImport){if(!restored){this.unsafe=true;message+=' 일부 변경의 복원을 확인하지 못했어요. 네이버에서 초안을 확인해 주세요.';}else message+=' 작업 전 상태로 복원했어요.';}
   }
   if(request.type==='photo-ai-on'&&mutating){const status=photoAiStatus(this.reader.read().blocks);message+=' 현재 '+status.total+'장 중 '+status.on+'장 ON이에요.';if(!this.unsafe)message+=' 다시 실행하면 꺼진 사진만 켜요.';}
   return {ok:false,error:message,...(this.unsafe?{recoveryRequired:true}:{})};
  }finally{releaseMutationGuard?.();if(ownsBusy)this.busy=false;}
 }
}
