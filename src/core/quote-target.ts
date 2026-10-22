import type { Selection, Snapshot } from './types';

/** Quotation styles apply to every selected paragraph, including from a caret. */
export function quoteTarget(snapshot:Snapshot):Selection{
 const target=snapshot.paragraphTarget;
 const multiple=snapshot.selection?.valid&&snapshot.selection.blockId!==snapshot.selection.endBlockId;
 const selection=target&&!multiple?{blockId:target.blockId,endBlockId:target.blockId,start:0,end:0,text:'',signature:target.signature,valid:true,collapsed:true}:snapshot.selection?.valid?snapshot.selection:null;
 if(!selection?.valid)throw new Error(snapshot.selectionIssue??'인용구로 바꿀 문단을 본문에서 클릭해 주세요.');
 const from=snapshot.blocks.findIndex(b=>b.id===selection.blockId),to=snapshot.blocks.findIndex(b=>b.id===selection.endBlockId),blocks=snapshot.blocks.slice(from,to+1);
 if(from<0||to<from||!blocks.some(block=>block.text.trim()))throw new Error('글자가 있는 문단을 클릭해 주세요.');
 if(blocks.some(block=>!['paragraph','heading','quote'].includes(block.kind)))throw new Error('본문 문단만 이어서 드래그해 주세요.');
 return {...selection,start:0,end:blocks.at(-1)!.text.length,text:blocks.map(block=>block.text).join('\n'),collapsed:false};
}
