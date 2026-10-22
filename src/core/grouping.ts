import type { Block } from './types';
export type BlockGroup={id:string;title:string;blocks:Block[];paragraphCount:number;photoCount:number};
export function groupBlocks(blocks:Block[],chunkSize=20):BlockGroup[] {
 const hasHeadings=blocks.some(b=>b.kind==='heading');
 const groups:BlockGroup[]=[];let current:BlockGroup|undefined;let unheaded=0;
 for(const block of blocks){
  if(block.kind==='heading'){current={id:'group-'+block.id,title:block.text||'소제목',blocks:[],paragraphCount:0,photoCount:0};groups.push(current);}
  else if(!current||(!hasHeadings&&current.paragraphCount>=chunkSize)){unheaded++;current={id:'section-'+block.id,title:'본문 구간 '+unheaded,blocks:[],paragraphCount:0,photoCount:0};groups.push(current);}
  current.blocks.push(block);if(['paragraph','heading'].includes(block.kind)&&block.text.trim())current.paragraphCount++;if(block.kind==='photo')current.photoCount++;
 }
 return groups;
}
