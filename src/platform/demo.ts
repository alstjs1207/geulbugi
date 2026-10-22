import {photoAiStatus} from '../core/photo-ai';
import type { Block, Snapshot, EditorRequest, EditorResponse, Post, Run, Selection } from '../core/types';
import { documentSignature, blockSignature, hash, sliceRuns, mergeRuns } from '../core/hash';
import { safeHref,canonicalLinkedUrl } from '../core/security';
import {resolveQuoteStyle} from '../core/naver-format-options';
import {quoteTarget} from '../core/quote-target';
import {validatePublishTime} from '../core/schedule';
import type {PublishTime} from '../core/types';
const image='/demo-forest.svg';
const p=(id:string,text:string,kind:Block['kind']='paragraph'):Block=>({id,kind,text,runs:[{text,marks:{}}],align:'left',...(kind==='quote'?{quoteStyle:'quotation_line'}:{})});
export const demoPosts:Post[]=[
 {blogId:'example_blog',postId:'10001',url:'https://blog.naver.com/example_blog/10001',title:'아이와 걷기 좋은 숲길 3곳',tags:['아이','숲길','산책'],excerpt:'유모차 없이도 가볍게 걸을 수 있는 코스예요.',publishedAt:'2026-10-02',collectedAt:'2026-10-06T00:00:00Z'},
 {blogId:'example_blog',postId:'10002',url:'https://blog.naver.com/example_blog/10002',title:'가을 나들이 준비 체크리스트',tags:['가을','나들이'],excerpt:'물과 간식, 가벼운 겉옷을 챙겨 주세요.',publishedAt:'2026-09-28',collectedAt:'2026-10-06T00:00:00Z'},
 {blogId:'example_blog',postId:'10003',url:'https://blog.naver.com/example_blog/10003',title:'지난 주말 산책 기록',tags:['아이','산책'],excerpt:'선선한 바람과 함께한 즐거운 시간이었어요.',publishedAt:'2026-09-21',collectedAt:'2026-10-06T00:00:00Z'}
];
export class DemoEditor {
 private blocks:Block[]=[
  p('intro','주말에는 아이와 함께 숲길을 걸었어요. 바람이 선선해서 산책하기 좋았고, 중간에 쉬어 갈 벤치도 많았어요.'),
  {id:'photo-1',kind:'photo',text:'가을 햇살이 내려앉은 숲길',runs:[],photo:{src:image,caption:'가을 햇살이 내려앉은 숲길',alt:'가을 숲길 예시',groupSize:1}},
  p('heading-1','가볍게 걷기 좋은 코스','heading'),
  {id:'body-1',kind:'paragraph',text:'길이 완만해서 아이와 천천히 걷기 좋았어요. 햇살이 나뭇잎 사이로 내려와 사진을 남기기에도 좋았어요. 자세한 코스는 지난 산책 기록에 정리해 두었어요.',runs:[{text:'길이 완만해서 ',marks:{}},{text:'아이와 천천히',marks:{bold:true}},{text:' 걷기 좋았어요. 햇살이 나뭇잎 사이로 내려와 사진을 남기기에도 좋았어요. 자세한 코스는 ',marks:{}},{text:'지난 산책 기록',marks:{href:demoPosts[2].url,color:'#139B64'}},{text:'에 정리해 두었어요.',marks:{}}],align:'left'},
  p('body-2','중간에 쉬어 갈 벤치도 있어 편하게 다녀왔어요. 물과 간식을 챙기면 더욱 여유롭게 걸을 수 있어요.'),
  {id:'photo-2',kind:'photo',text:'잠깐 쉬어 가요',runs:[],photo:{src:image,caption:'잠깐 쉬어 가요',alt:'쉼터 예시',groupSize:1}},
  p('heading-2','산책 전 챙겨 주세요','heading'),p('body-3','가벼운 겉옷과 물, 아이 간식을 준비해 주세요. 편한 운동화를 신으면 더 좋아요.'),
  p('quote-1','천천히 걸어도 충분히 좋은 하루예요.','quote'),
  {id:'table-1',kind:'table',text:'준비물 | 물 · 간식 · 겉옷',runs:[{text:'준비물 | 물 · 간식 · 겉옷',marks:{}}]},
  {id:'photo-3',kind:'photo',text:'산책길에서 만난 낙엽',runs:[],photo:{src:image,caption:'산책길에서 만난 낙엽',alt:'낙엽 예시',groupSize:2}}
 ];
 private publishTime:PublishTime={mode:'now'};
 private selection:Selection|null=null;
 private history:{blocks:Block[];selection:Selection|null}[]=[];
 constructor(){for(const block of this.blocks){if(block.photo)block.photo.items=Array.from({length:block.photo.groupSize},()=>({src:block.photo!.src,alt:block.photo!.alt,aiMarked:false}));}this.select('body-1',0,this.blocks.find(b=>b.id==='body-1')!.text.length);}
 select(id:string,start:number,end:number,endId=id):void{
  const from=this.blocks.findIndex(b=>b.id===id),to=this.blocks.findIndex(b=>b.id===endId);if(from<0||to<from)return;
  const blocks=this.blocks.slice(from,to+1),collapsed=id===endId&&start===end;
  this.selection={blockId:id,endBlockId:endId,start,end,text:collapsed?'':blocks.map((block,index)=>block.text.slice(index===0?start:0,index===blocks.length-1?end:block.text.length)).join('\n'),signature:hash(blocks.map(blockSignature)),valid:true,collapsed};}
 snapshot():Snapshot{
  return {sessionId:'demo',documentKey:'demo-document',adapterSignature:'demo-only',capabilities:['publish-time','photo-ai-on'],title:'아이와 함께한 가을 숲 산책',url:'http://127.0.0.1:5178/',revision:documentSignature('아이와 함께한 가을 숲 산책',this.blocks),editable:true,blocks:structuredClone(this.blocks),selection:this.selection?structuredClone(this.selection):null,linkedUrls:this.blocks.flatMap(b=>[...b.runs.flatMap(r=>r.marks.href?[canonicalLinkedUrl(r.marks.href)!]:[]),...(b.linkCard?[b.linkCard.url]:[])]),uploadBusy:false,canUndo:this.history.length>0,publishTime:structuredClone(this.publishTime)};
 }
 private save():void{this.history.push({blocks:structuredClone(this.blocks),selection:structuredClone(this.selection)});if(this.history.length>30)this.history.shift();}
 async handle(request:EditorRequest):Promise<EditorResponse>{
  try{
   if(request.type==='snapshot'||request.type==='focus')return {ok:true,snapshot:this.snapshot()};
   if(request.type==='publish-time'){
    const current=this.snapshot(),expected=request.expected;
    if(!expected||expected.sessionId!==current.sessionId||expected.documentKey!==current.documentKey||expected.revision!==current.revision)throw new Error('본문이나 편집 탭이 바뀌었어요. 예약 시간을 다시 확인해 주세요.');
    this.publishTime=validatePublishTime(request.value);return {ok:true,snapshot:this.snapshot()};
   }
   if(request.type==='photo-ai-on'){
    const current=this.snapshot(),expected=request.expected;
    if(!expected||expected.sessionId!==current.sessionId||expected.documentKey!==current.documentKey||expected.revision!==current.revision)throw new Error('본문이나 사진이 바뀌었어요. 사진 목록을 새로고침해 주세요.');
    const status=photoAiStatus(this.blocks);
    if(!status.total)throw new Error('AI 활용 설정을 켤 사진이 없어요.');
    if(status.on===status.total)return {ok:true,snapshot:current,unchanged:true};
    this.save();for(const block of this.blocks)for(const item of block.photo?.items??[])item.aiMarked=true;
    return {ok:true,snapshot:this.snapshot()};
   }
   if(!['format','link','photo-add','photo-move','photo-add-cancel','linebreak','undo'].includes(request.type))throw new Error('지원하지 않는 편집 요청이에요.');
   if(request.type==='undo'){const previous=this.history.pop();if(!previous)throw new Error('되돌릴 작업이 없어요.');this.blocks=previous.blocks;this.selection=previous.selection;return {ok:true,snapshot:this.snapshot()};}
   if(request.type==='format'){
    if(request.preset.format.paragraphStyle==='quote')this.selection=quoteTarget(this.snapshot());
    if(!this.selection?.valid||this.selection.collapsed)throw new Error('적용할 글자를 먼저 선택해 주세요.');
    this.save();const from=this.blocks.findIndex(b=>b.id===this.selection!.blockId),to=this.blocks.findIndex(b=>b.id===this.selection!.endBlockId);
    for(let i=from;i<=to;i++){const block=this.blocks[i];if(!['paragraph','heading','quote'].includes(block.kind))continue;const start=i===from?this.selection.start:0,end=i===to?this.selection.end:block.text.length;
     const f=request.preset.format;
     if(f.paragraphStyle==='quote')block.quoteStyle=resolveQuoteStyle(f,block);
     else if(f.paragraphStyle==='body')delete block.quoteStyle;
     if(f.align)block.align=f.align;
     else if(f.paragraphStyle==='quote')block.align=block.quoteStyle==='quotation_line'?'left':'center';
     if(f.paragraphStyle)block.kind=f.paragraphStyle==='quote'?'quote':'paragraph';
     const affected=sliceRuns(block.runs,start,end).map(r=>({text:r.text,marks:{...r.marks,...Object.fromEntries(Object.entries(f).filter(([key])=>['fontSize','color','bold','background'].includes(key)))}}));
     block.runs=mergeRuns([...sliceRuns(block.runs,0,start),...affected,...sliceRuns(block.runs,end,block.text.length)]);if(f.fontSize&&f.fontSize>=19&&f.bold&&block.kind==='paragraph')block.kind='heading';
    }
   }else if(request.type==='link'){
    if(!this.selection?.valid||!this.selection.collapsed)throw new Error('미리보기 카드를 넣을 위치를 본문에서 클릭해 주세요.');
    if(this.snapshot().linkedUrls.includes(request.post.url))throw new Error('이미 삽입한 링크예요.');
    const index=this.blocks.findIndex(b=>b.id===this.selection!.blockId),block=this.blocks[index];
    if(!block||!['paragraph','heading'].includes(block.kind))throw new Error('미리보기 카드를 넣을 본문 문단을 선택해 주세요.');
    if(!safeHref(request.post.url))throw new Error('링크 주소를 확인해 주세요.');this.save();
    const prefix=sliceRuns(block.runs,0,this.selection.start),suffix=sliceRuns(block.runs,this.selection.start,block.text.length);
    const tail={...block,id:'after-'+crypto.randomUUID(),runs:suffix,text:suffix.map(r=>r.text).join('')};
    const card:Block={id:'card-'+crypto.randomUUID(),kind:'link-card',text:request.post.title,runs:[],linkCard:{url:request.post.url,title:request.post.title,description:request.post.excerpt,image,domain:'blog.naver.com'}};
    this.blocks.splice(index,1,{...block,runs:prefix,text:prefix.map(r=>r.text).join('')},card,tail);
    this.select(tail.id,0,0);
   }else if(request.type==='linebreak'){
    if(request.plan.revision!==this.snapshot().revision||!request.plan.contentPreserved)throw new Error('본문이 바뀌었어요. 미리보기를 다시 열어 주세요.');
    for(const change of request.plan.changes){const block=this.blocks.find(b=>b.id===change.blockId);if(!block||blockSignature(block)!==change.sourceSignature)throw new Error('대상 문단을 다시 선택해 주세요.');}
    this.save();for(const change of request.plan.changes){const block=this.blocks.find(b=>b.id===change.blockId)!;block.runs=mergeRuns([...sliceRuns(block.runs,0,change.start),...change.after,...sliceRuns(block.runs,change.end,block.text.length)]);block.text=block.runs.map(r=>r.text).join('');}
   }else if(request.type==='photo-move'){
    const photo=this.blocks.find(b=>b.id===request.photoId),target=this.blocks.find(b=>b.id===request.targetId);if(!photo?.photo||!target||!['paragraph','heading'].includes(target.kind))throw new Error('사진과 대상 문단을 선택해 주세요.');
    this.save();this.blocks=this.blocks.filter(b=>b.id!==photo.id);const index=this.blocks.findIndex(b=>b.id===target.id);this.blocks.splice(index+(request.placement==='after'?1:0),0,photo);
   }else if(request.type==='photo-add-cancel'){return {ok:true,snapshot:this.snapshot()};}else if(request.type==='photo-add'){throw new Error('실제 사진 추가는 네이버의 기존 업로드 창을 이용해요. 미리보기에서는 기존 사진 이동을 확인할 수 있어요.');}
   if(this.selection){const start=this.blocks.find(b=>b.id===this.selection!.blockId),end=this.blocks.find(b=>b.id===this.selection!.endBlockId);this.selection.valid=!!start&&!!end;if(start&&end)this.selection.signature=hash([blockSignature(start),blockSignature(end)]);}
   return {ok:true,snapshot:this.snapshot()};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:String(error)};}
 }
}
export const demoEditor=new DemoEditor();
