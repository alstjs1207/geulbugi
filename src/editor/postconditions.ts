import type { Block, EditorRequest, Marks, Run, Snapshot, PhotoInsertion } from '../core/types';
import { blockSignature, sliceRuns, mergeRuns, hash } from '../core/hash';
import {resolveQuoteStyle} from '../core/naver-format-options';
import {quoteTarget} from '../core/quote-target';
import {canonicalLinkedUrl} from '../core/security';
function color(value:string|undefined):string|undefined{
 if(!value)return;const rgb=value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*1)?\)$/);
 return rgb?'#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):value.toLowerCase();
}
function normalized(marks:Marks){return {bold:!!marks.bold,italic:!!marks.italic,underline:!!marks.underline,color:color(marks.color),background:color(marks.background),fontSize:marks.fontSize,href:marks.href};}
function richSignature(runs:Run[]):string{return hash(mergeRuns(runs.map(r=>({text:r.text.replace(/\u00a0/gu,' ').replace(/\n/gu,''),marks:normalized(r.marks)}))));}
const isText=(block:Block)=>['paragraph','heading','quote'].includes(block.kind);
const content=(block:Block)=>block.runs.map(r=>r.text).join('');
function linkSideSignature(blocks:Block[]):string{
 return hash(blocks.filter(b=>!isText(b)||content(b)!==''&&content(b)!=='\n').map(b=>isText(b)?{kind:b.kind==='heading'?'paragraph':b.kind,align:b.align,quoteStyle:b.quoteStyle,runs:mergeRuns(b.runs.map(r=>({text:r.text.replace(/\u00a0/gu,' '),marks:normalized(r.marks)})))}:blockSignature(b)));
}
function verifyLinkCard(before:Snapshot,after:Snapshot,request:Extract<EditorRequest,{type:'link'}>):void{
 if(before.title!==after.title)throw new Error('미리보기 삽입 중 제목이 바뀌었어요.');
 const selection=before.selection,index=before.blocks.findIndex(b=>b.id===selection?.blockId),source=before.blocks[index];
 if(!selection?.valid||!selection.collapsed||!source||!['paragraph','heading'].includes(source.kind))throw new Error('미리보기 카드를 넣을 본문 커서 위치를 다시 선택해 주세요.');
 const cards=after.blocks.filter(b=>b.kind==='link-card'),matches=cards.filter(b=>canonicalLinkedUrl(b.linkCard?.url)===canonicalLinkedUrl(request.post.url));
 if(cards.length!==before.blocks.filter(b=>b.kind==='link-card').length+1||matches.length!==1||!matches[0].linkCard?.title)throw new Error('삽입한 미리보기 카드와 주소를 확인하지 못했어요.');
 const cardIndex=after.blocks.indexOf(matches[0]);
 const left={...source,runs:sliceRuns(source.runs,0,selection.start)},right={...source,runs:sliceRuns(source.runs,selection.start,source.text.length)};
 if(linkSideSignature([...before.blocks.slice(0,index),left])!==linkSideSignature(after.blocks.slice(0,cardIndex))||linkSideSignature([right,...before.blocks.slice(index+1)])!==linkSideSignature(after.blocks.slice(cardIndex+1)))throw new Error('미리보기 카드의 커서 위치와 기존 글·서식·구성 요소의 보존을 확인하지 못했어요.');
}
function logicalText(blocks:Block[]):string{
 // Naver turns pasted spaces into NBSP during native Enter/undo. Normalize
 // horizontal spaces only: newline positions and blank-line counts still matter.
 return blocks.map(b=>b.kind==='paragraph'?((content(b)==='\n'?'':content(b)).replace(/\u00a0/gu,' ')+'\n'):'['+blockSignature(b)+']').join('');
}
export function photoImageCount(blocks:Block[]):number{return blocks.filter(block=>block.kind==='photo').reduce((count,block)=>count+(block.photo?.groupSize??0),0);}
export function verifyPhotoMove(before:Snapshot,after:Snapshot,request:Extract<EditorRequest,{type:'photo-move'}>):void{
 if(before.title!==after.title||before.documentKey!==after.documentKey)throw new Error('사진 이동 중 문서가 바뀌었어요.');
 if(!['before','after'].includes(request.placement))throw new Error('사진을 넣을 문단 앞·뒤를 선택해 주세요.');
 const photo=before.blocks.find(block=>block.id===request.photoId),target=before.blocks.find(block=>block.id===request.targetId);
 if(!photo?.photo||!target||!['paragraph','heading'].includes(target.kind))throw new Error('사진과 대상 문단을 선택해 주세요.');
 const expected=before.blocks.filter(block=>block.id!==photo.id),index=expected.findIndex(block=>block.id===target.id);
 expected.splice(index+(request.placement==='after'?1:0),0,photo);
 // Native moves can recreate the target paragraph and add/remove empty cursor
 // fillers. Compare the complete rich content in order, never stale DOM IDs.
 if(linkSideSignature(expected)!==linkSideSignature(after.blocks))throw new Error('사진의 문단 앞·뒤 위치와 원문·서식·사진·캡션의 보존을 확인하지 못했어요.');
}
export function verifyPhotoAddition(before:Snapshot,after:Snapshot,target:PhotoInsertion,count:number):void{
 if(before.title!==after.title||before.documentKey!==after.documentKey)throw new Error('사진 추가 중 문서가 바뀌었어요.');
 const index=before.blocks.findIndex(block=>block.id===target.targetId),source=before.blocks[index];
 if(!source||!['paragraph','heading'].includes(source.kind))throw new Error('사진을 넣을 문단을 다시 선택해 주세요.');
 const identity=(block:Block)=>block.componentId??block.id,oldPhotos=new Set(before.blocks.filter(block=>block.kind==='photo').map(identity));
 const additions=after.blocks.map((block,index)=>({block,index})).filter(({block})=>block.kind==='photo'&&!oldPhotos.has(identity(block)));
 if(!additions.length||photoImageCount(additions.map(({block})=>block))!==count||photoImageCount(after.blocks)!==photoImageCount(before.blocks)+count)throw new Error('선택한 사진이 모두 추가되었는지 확인하지 못했어요.');
 const first=additions[0].index,last=additions.at(-1)!.index;
 if(after.blocks.slice(first,last+1).some(block=>block.kind!=='photo'&&(block.kind!=='paragraph'||block.text.trim())))throw new Error('추가한 사진의 연속된 위치를 확인하지 못했어요.');
 const boundary=target.placement==='before'?index:index+1;
 if(linkSideSignature(before.blocks.slice(0,boundary))!==linkSideSignature(after.blocks.slice(0,first))||linkSideSignature(before.blocks.slice(boundary))!==linkSideSignature(after.blocks.slice(last+1)))throw new Error('사진의 문단 앞·뒤 위치와 기존 글·서식·사진·캡션의 보존을 확인하지 못했어요.');
}
export function verifyPostconditions(before:Snapshot,after:Snapshot,request:EditorRequest):void{
 if(!['format','link','linebreak','photo-move','photo-add'].includes(request.type))return;
 if(request.type==='link'){verifyLinkCard(before,after,request);return;}
 if(request.type==='photo-move'){verifyPhotoMove(before,after,request);return;}
 const protectedBefore=before.blocks.filter(b=>!isText(b)&&b.kind!=='photo').map(blockSignature);
 const protectedAfter=after.blocks.filter(b=>!isText(b)&&b.kind!=='photo').map(blockSignature);
 if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw new Error('표·목록·구성 요소의 보존을 확인하지 못했어요.');
 const expected=structuredClone(before.blocks);
 if(request.type==='format'){
  const selection=request.preset.format.paragraphStyle==='quote'?quoteTarget(before):before.selection;if(!selection?.valid||selection.collapsed)throw new Error('선택 영역을 다시 확인해 주세요.');
  const from=expected.findIndex(b=>b.id===selection.blockId),to=expected.findIndex(b=>b.id===selection.endBlockId);
  if(from<0||to<from)throw new Error('선택 문단이 달라졌어요.');
  const format=request.preset.format,quoteStyle=format.paragraphStyle==='quote'?resolveQuoteStyle(format,expected[from]):undefined;
  const quoteComponent=format.paragraphStyle==='quote'&&expected[from].kind==='quote'?expected[from].componentId:undefined;
  const visibleBefore=expected.filter(b=>isText(b)&&content(b).trim()),visibleAfter=after.blocks.filter(b=>isText(b)&&content(b).trim());
  if(visibleBefore.length!==visibleAfter.length)throw new Error('서식 적용 중 문단 구조가 바뀌었어요.');
  for(let index=0;index<expected.length;index++){
   const block=expected[index];if(!isText(block))continue;
   const actualIndex=visibleBefore.findIndex(b=>b.id===block.id),actual=after.blocks.find(current=>current.id===block.id)??visibleAfter[actualIndex];
   if(index<from||index>to){
    const sameQuote=quoteComponent&&block.kind==='quote'&&block.componentId===quoteComponent;
    if(content(block).trim()&&(!actual||content(actual).replace(/\u00a0/gu,' ')!==content(block).replace(/\u00a0/gu,' ')))throw new Error('선택하지 않은 문단의 문구·공백 보존을 확인하지 못했어요.');
    if(actual&&(actual.kind!==block.kind||(!sameQuote&&actual.align!==block.align)||actual.quoteStyle!==(sameQuote?quoteStyle:block.quoteStyle)))throw new Error('선택하지 않은 문단의 서식이 바뀌었어요.');
    continue;
   }
   if(!actual||content(actual).replace(/\u00a0/gu,' ')!==content(block).replace(/\u00a0/gu,' '))throw new Error('선택 문단의 문구가 바뀌었어요.');
   const start=index===from?selection.start:0,end=index===to?selection.end:block.text.length;
   if(format.align&&actual.align!==format.align)throw new Error('요청한 문단 정렬을 확인하지 못했어요.');
   if(format.paragraphStyle==='quote'&&actual.kind!=='quote'||format.paragraphStyle==='body'&&actual.kind==='quote')throw new Error('요청한 문단 스타일을 확인하지 못했어요.');
   if(quoteStyle!==undefined&&actual.quoteStyle!==quoteStyle)throw new Error('요청한 인용구 모양을 확인하지 못했어요.');
   if(format.paragraphStyle===undefined&&actual.quoteStyle!==block.quoteStyle)throw new Error('인용구 모양이 바뀌었어요.');
   const changed=sliceRuns(block.runs,start,end).map(run=>({text:run.text,marks:{...run.marks,...Object.fromEntries(Object.entries(format).filter(([key])=>['bold','color','background','fontSize'].includes(key)))}}));
   block.runs=mergeRuns([...sliceRuns(block.runs,0,start),...changed,...sliceRuns(block.runs,end,block.text.length)]);
  }
 }
 if(richSignature(expected.filter(isText).flatMap(b=>b.runs))!==richSignature(after.blocks.filter(isText).flatMap(b=>b.runs)))throw new Error('원문·일반 링크·지정하지 않은 글자 서식의 보존을 확인하지 못했어요.');
 if(request.type==='linebreak'){
  for(const change of request.plan.changes){const block=expected.find(b=>b.id===change.blockId);if(!block)throw new Error('정리 대상 문단이 사라졌어요.');block.runs=mergeRuns([...sliceRuns(block.runs,0,change.start),...change.after,...sliceRuns(block.runs,change.end,block.text.length)]);}
  if(logicalText(expected)!==logicalText(after.blocks))throw new Error('선택한 줄바꿈 위치와 간격을 확인하지 못했어요.');
 }
}
