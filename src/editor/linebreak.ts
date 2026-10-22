import type {Block,BreakPlan} from '../core/types';
import {blockSignature,mergeRuns,sliceRuns} from '../core/hash';
import {verifyPostconditions} from './postconditions';
import type {EditorReader} from './reader';
import type {PublicEditorUI} from './public-ui';
import type {Snapshot} from '../core/types';

export async function applyNativeLinebreaks(reader:EditorReader,ui:PublicEditorUI,before:Snapshot,plan:BreakPlan,guard:()=>void):Promise<void>{
 const targets=plan.changes.map((change,index)=>{
  const source=before.blocks.find(block=>block.id===change.blockId)!;
  return {change,source,ordinal:index+1,nativeId:reader.elements.get(change.blockId)?.id,id:change.blockId,prefixEnd:source.text.length,runs:structuredClone(source.runs),applied:false};
 });
 for(const target of [...targets].reverse()){
  try{
   for(const point of [...target.change.insertions].reverse()){
    guard();const current=reader.read();
    const candidates=current.blocks.filter(block=>block.id===target.id||!!target.nativeId&&reader.elements.get(block.id)?.id===target.nativeId);
    const block=candidates.length===1?candidates[0]:undefined;
    const expected:Block={...target.source,runs:mergeRuns(sliceRuns(target.source.runs,0,target.prefixEnd))};
    if(!block||block.kind!=='paragraph'||blockSignature(block)!==blockSignature(expected))throw new Error('정리할 문단의 위치와 원문을 다시 확인해 주세요.');
    target.id=block.id;
    await reader.selectAt(block.id,point.offset,guard);
    for(let count=0;count<point.count;count++){
     guard();await ui.insertParagraph(guard);guard();
     const length=target.runs.reduce((sum,run)=>sum+run.text.length,0);
     target.runs=mergeRuns([...sliceRuns(target.runs,0,point.offset),{text:'\n',marks:{}},...sliceRuns(target.runs,point.offset,length)]);target.applied=true;
     // Verify every completed Enter, not just the final whole-document result.
     // New DOM IDs are allowed; rich text and newline positions must match.
     const partial:BreakPlan={...plan,changes:targets.filter(item=>item.applied).map(item=>({...item.change,start:0,end:item.source.text.length,after:item.runs}))};
     verifyPostconditions(before,reader.read(),{type:'linebreak',plan:partial});
    }
    target.prefixEnd=point.offset;
   }
  }catch(error){
   // Preserve the error class so unconfirmed native input is never auto-undone.
   if(error instanceof Error)error.message='줄바꿈 대상 '+target.ordinal+'/'+targets.length+'번 문단: '+error.message;
   throw error;
  }
 }
}
