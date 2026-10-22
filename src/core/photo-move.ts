import type {Block,Snapshot} from './types';

// Native photo moves can replace a paragraph's DOM node and its reader ID.
// The verified non-photo content remains in the same order, even with repeated
// paragraph text. Ignore only empty native cursor fillers when matching IDs.
export function movedPhotoTarget(before:Snapshot,after:Snapshot,targetId:string):string|undefined{
 if(after.blocks.some(block=>block.id===targetId))return targetId;
 const material=(blocks:Block[])=>blocks.filter(block=>block.kind!=='photo'&&(block.kind!=='paragraph'||block.text!==''&&block.text!=='\n'));
 const originals=material(before.blocks),index=originals.findIndex(block=>block.id===targetId),source=originals[index],target=material(after.blocks)[index];
 if(!source||!target||!['paragraph','heading'].includes(target.kind)||source.text.replace(/\u00a0/gu,' ')!==target.text.replace(/\u00a0/gu,' '))return;
 return target.id;
}
