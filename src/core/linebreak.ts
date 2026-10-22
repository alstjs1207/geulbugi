import type { Block, BreakRules, BreakPlan, Run, Snapshot } from './types';
import { blockSignature, mergeRuns, sliceRuns } from './hash';
type Span={start:number;end:number};
const QUOTES:Record<string,string>={"“":"”","‘":"’","「":"」","『":"』","«":"»","\"":"\"","'":"'"};
const BRACKETS:Record<string,string>={'(':')','[':']','{':'}','（':'）','【':'】'};
function apostrophe(text:string,index:number):boolean{return text[index]==="'"&&/[a-z]/i.test(text[index-1]??'')&&/[a-z]/i.test(text[index+1]??'');}
function protectedSpans(text:string,runs:Run[]):Span[]{
 const spans:Span[]=[];let cursor=0;
 const stack:{start:number;close:string}[]=[];
 for(let i=0;i<text.length;i++){
  if(apostrophe(text,i))continue;const char=text[i];
  if(stack.at(-1)?.close===char){const opened=stack.pop()!;spans.push({start:opened.start,end:i+1});}
  else if(QUOTES[char]||BRACKETS[char])stack.push({start:i,close:QUOTES[char]??BRACKETS[char]});
 }
 for(const opened of stack)spans.push({start:opened.start,end:text.length});
 for(const run of runs){if(run.marks.href)spans.push({start:cursor,end:cursor+run.text.length});cursor+=run.text.length;}
 for(const regex of [/https?:\/\/[^\s<>"'「」“”‘’]+/giu,/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,/\b\d{4}[./-]\s*\d{1,2}[./-]\s*\d{1,2}(?:\.)?/gu,/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/gu,/\b\d+\.\d+\b/gu,/\b(?:e\.g\.|i\.e\.|Dr\.|Mr\.|Mrs\.|Ms\.|etc\.|[A-Z](?:\.[A-Z])+\.)/giu]){
  for(const match of text.matchAll(regex)){let end=match.index+match[0].length;if(regex.source.startsWith('https?'))while(end>match.index&&/[.!?]$/.test(text.slice(match.index,end)))end--;spans.push({start:match.index,end});}
 }
 return spans;
}
export function sentenceBoundaries(text:string,runs:Run[]=[]):number[]{
 const spans=protectedSpans(text,runs),out:number[]=[];
 for(let i=0;i<text.length;i++){
  if(!/[.!?。！？]/.test(text[i])||spans.some(s=>i>=s.start&&i<s.end))continue;
  if(text[i]==='.'&&/\d/.test(text[i-1]??'')&&/\d/.test(text[i+1]??''))continue;
  let end=i+1;while(end<text.length&&/[.!?。！？”’"'」』)\]]/.test(text[end]))end++;
  if(end<text.length&&!/\s/.test(text[end]))continue;
  while(end<text.length&&/[ \t\u00a0]/.test(text[end]))end++;
  if(end<text.length)out.push(end);i=end-1;
 }
 return [...new Set(out)];
}
function lengthBoundaries(text:string,start:number,end:number,limit:number,spans:Span[]):number[]{
 const boundaries:number[]=[];let left=start;
 while(left<end){
  let wanted=left;for(let count=0;count<limit&&wanted<end;count++)wanted+=(text.codePointAt(wanted)??0)>0xffff?2:1;
  if(wanted>=end)break;
  const allowed=(i:number)=>/[ \t\u00a0,;，；]/.test(text[i])&&!spans.some(s=>i>s.start&&i<s.end);
  let candidate=-1;for(let i=left+1;i<=wanted;i++)if(allowed(i))candidate=i+1;
  if(candidate<=left){for(let i=wanted+1;i<end;i++)if(allowed(i)){candidate=i+1;break;}}
  if(candidate<=left||candidate>=end)break;boundaries.push(candidate);left=candidate;
 }
 return boundaries;
}
// Conservative local cues, not a claim to understand arbitrary Korean prose.
// Never fall back to an arbitrary space in meaning mode: a longer intact
// sentence is preferable to separating a modifier, a noun or an auxiliary.
function meaningBoundaries(text:string,start:number,end:number,limit:number,spans:Span[]):number[]{
 const candidates:{offset:number;punctuation:boolean}[]=[];
 const connective=/(?:지만|는데|으며|면서|으나|거나|더라도|수록|자마자|더니|도록|어서|아서|여서|해서|므로|기에|다가|고서|하고|이고|되고|있고|없고|좋고|많고|적고|했고|었고|았고)$/u;
 const transition=/^(?:하지만|그러나|그런데|그래서|따라서|그러므로|다만|반면|또한|그리고|대신|예를[ \t\u00a0]+들어)(?:[ \t\u00a0]|$)/u;
 const dependent=/^(?:수|것|때|데|줄|뿐|중|바|만큼|정도|듯|채|난)(?:[은는이가을를에도만의]|[ \t\u00a0]|$)|^(?:않|못하|싶|보이|있|없|나서|나면)/u;
 const horizontal=/[ \t\u00a0]/u;
 for(let i=start;i<end;i++){
  if(!horizontal.test(text[i]))continue;
  let offset=i+1;while(offset<end&&horizontal.test(text[offset]))offset++;
  if(spans.some(s=>offset>s.start&&offset<s.end)){i=offset-1;continue;}
  const previous=text.slice(start,i).match(/[^\s]+$/u)?.[0]??'',next=text.slice(offset,end);
  const punctuation=/[,;，；]$/u.test(previous);
  if(!dependent.test(next)&&(punctuation||connective.test(previous)||transition.test(next)))candidates.push({offset,punctuation});
  i=offset-1;
 }
 const points=new Uint32Array(text.length+1);
 for(let i=0;i<text.length;i++)points[i+1]=points[i]+(i>0&&/[\uDC00-\uDFFF]/u.test(text[i])&&/[\uD800-\uDBFF]/u.test(text[i-1])?0:1);
 const count=(from:number,to:number)=>points[to]-points[from];
 const boundaries:number[]=[];let left=start;
 while(count(left,end)>limit){
  const minimum=Math.max(6,Math.floor(limit*.5)),tail=Math.max(5,Math.floor(limit*.25));
  const options=candidates.filter(c=>c.offset>left&&count(left,c.offset)>=minimum&&count(c.offset,end)>=tail);
  if(!options.length)break;
  options.sort((a,b)=>{
   const score=(c:typeof a)=>Math.abs(count(left,c.offset)-limit)/limit+(c.punctuation?0:.15);
   return score(a)-score(b)||a.offset-b.offset;
  });
  left=options[0].offset;boundaries.push(left);
 }
 return boundaries;
}
export function wrapRuns(input:Run[],rules:BreakRules):{runs:Run[];insertions:{offset:number;count:number}[]} {
 const source=structuredClone(input);const text=source.map(r=>r.text).join('');
 const protectedRanges=protectedSpans(text,source);
 const lineCuts=rules.preserveExisting&&!rules.reflow?[0,...Array.from(text.matchAll(/\n/gu),m=>m.index+1),text.length]:[0,text.length];
 const insert=new Map<number,number>();
 for(let line=0;line<lineCuts.length-1;line++){
  const from=lineCuts[line],to=lineCuts[line+1];const value=text.slice(from,to);
  const sentenceEnds=sentenceBoundaries(value,sliceRuns(source,from,to)).map(n=>n+from);
  sentenceEnds.forEach((offset,index)=>{if((index+1)%rules.sentences===0)insert.set(offset,1+rules.blankLines);});
  const cuts=[from,...[...insert.keys()].filter(n=>n>from&&n<to).sort((a,b)=>a-b),to];
  const boundaries=rules.longMode==='length'?lengthBoundaries:meaningBoundaries;
  for(let i=0;i<cuts.length-1;i++)for(const offset of boundaries(text,cuts[i],cuts[i+1],rules.longLength,protectedRanges))if(!insert.has(offset))insert.set(offset,1);
 }
 const offsets=[...insert].sort((a,b)=>a[0]-b[0]).filter(([offset])=>offset>0&&offset<text.length&&text[offset-1]!=='\n'&&text[offset]!=='\n');
 const out:Run[]=[];let cursor=0;for(const [offset,count] of offsets){out.push(...sliceRuns(source,cursor,offset),{text:'\n'.repeat(count),marks:{}});cursor=offset;}out.push(...sliceRuns(source,cursor,text.length));
 if(rules.reflow&&!rules.preserveExisting){ // Reflow is restricted to a selected range by buildBreakPlan.
  const rebuilt:Run[]=source.map(run=>({text:run.text.replace(/\n+/g,' '),marks:{...run.marks}}));
  return wrapRuns(rebuilt,{...rules,reflow:false,preserveExisting:false});
 }
 return {runs:mergeRuns(out),insertions:offsets.map(([offset,count])=>({offset,count}))};
}
export function buildBreakPlan(snapshot:Snapshot,rules:BreakRules):BreakPlan {
 if(rules.longLength<10||rules.longLength>120)throw new Error('긴 문장 기준은 10~120자로 설정해 주세요.');
 if(rules.reflow&&rules.scope!=='selection')throw new Error('기존 줄바꿈 다시 정리는 선택한 일반 텍스트 범위에서만 가능해요.');
 const selection=snapshot.selection;
 if(rules.scope==='selection'&&(!selection?.valid||selection.collapsed))throw new Error('정리할 일반 본문을 먼저 선택해 주세요.');
 const startIndex=selection?snapshot.blocks.findIndex(b=>b.id===selection.blockId):-1;
 const endIndex=selection?snapshot.blocks.findIndex(b=>b.id===selection.endBlockId):-1;
 if(rules.scope==='selection'&&(startIndex<0||endIndex<startIndex))throw new Error('선택 위치를 다시 지정해 주세요.');
 const changes:BreakPlan['changes']=[];let excluded=0;
 for(let i=0;i<snapshot.blocks.length;i++){
  const block=snapshot.blocks[i];
  if(rules.scope==='selection'&&(i<startIndex||i>endIndex))continue;
  if(block.kind!=='paragraph'||!block.text.trim()){excluded++;continue;}
  const start=rules.scope==='selection'&&i===startIndex?selection!.start:0;
  const end=rules.scope==='selection'&&i===endIndex?selection!.end:block.text.length;
  const before=sliceRuns(block.runs,start,end),{runs:after,insertions}=wrapRuns(before,rules);
  if(before.map(r=>r.text).join('')!==after.map(r=>r.text).join(''))changes.push({blockId:block.id,before,after,start,end,paragraphBefore:structuredClone(block.runs),paragraphAfter:mergeRuns([...sliceRuns(block.runs,0,start),...after,...sliceRuns(block.runs,end,block.text.length)]),align:block.align,sourceSignature:blockSignature(block),insertions:insertions.map(p=>({...p,offset:p.offset+start}))});
 }
 const originalText=changes.map(c=>c.before.map(r=>r.text).join('')).join('\n\n');
 const resultText=changes.map(c=>c.after.map(r=>r.text).join('')).join('\n\n');
 const strip=(s:string)=>s.replace(/\s/gu,'');
 return {revision:snapshot.revision,documentKey:snapshot.documentKey,rules:{...rules},changes,excluded,originalText,resultText,contentPreserved:strip(originalText)===strip(resultText)};
}
