import type {Snapshot} from '../core/types';
function tokens(snapshot:Snapshot){return snapshot.blocks.filter(block=>['paragraph','heading','quote'].includes(block.kind)).flatMap(block=>block.runs.flatMap(run=>Array.from(run.text.replace(/\u00a0/gu,' ').replace(/\n/gu,'')).map(char=>({char,marks:{bold:!!run.marks.bold,italic:!!run.marks.italic,underline:!!run.marks.underline,color:run.marks.color,background:run.marks.background,fontSize:run.marks.fontSize,href:run.marks.href,kind:block.kind,align:block.align,quoteStyle:block.quoteStyle}}))));}
export function withinUndoBoundary(baseline:Snapshot,start:Snapshot,candidate:Snapshot):boolean{
 const a=tokens(baseline),b=tokens(start),c=tokens(candidate),text=(v:typeof a)=>v.map(t=>t.char).join('');
 // An erroneous native replacement still needs its own undo; the adapter's
 // original content guard covers transactions whose text differs at the start.
 if(text(a)!==text(b))return true;
 if(text(a)!==text(c))return false;
 return a.every((token,index)=>Object.keys(token.marks).every(key=>{
  const k=key as keyof typeof token.marks;return token.marks[k]!==b[index].marks[k]||c[index].marks[k]===token.marks[k];
 }));
}
