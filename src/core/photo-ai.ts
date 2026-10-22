import type {Block,Snapshot} from './types';
import {documentSignature} from './hash';

export function photoAiStatus(blocks:Block[]){
 let total=0,on=0,unknown=0;
 for(const block of blocks){
  if(!block.photo)continue;
  total+=block.photo.groupSize;
  for(let i=0;i<block.photo.groupSize;i++){
   const value=block.photo.items?.[i]?.aiMarked;
   if(value===true)on++;else if(value!==false)unknown++;
  }
 }
 return {total,on,unknown};
}

// AI labels are the only permitted difference during this operation. Include
// order, captions, layout, links and every image attribute in the comparison.
export function photoAiContent(snapshot:Snapshot):string{
 const blocks=structuredClone(snapshot.blocks);
 for(const block of blocks)for(const item of block.photo?.items??[])delete item.aiMarked;
 return documentSignature(snapshot.title,blocks);
}
