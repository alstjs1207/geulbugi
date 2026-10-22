import type { Block, Run } from './types';
export function hash(value:unknown):string {const str=typeof value==='string'?value:JSON.stringify(value);let n=2166136261;for(let i=0;i<str.length;i++){n^=str.charCodeAt(i);n=Math.imul(n,16777619);}return (n>>>0).toString(16);}
// Native history and saved drafts turn the editor's pasted NBSP into a regular
// space. Keep its position and count so undo stops before earlier user edits.
function nativeSpaces(runs:Run[]):Run[]{return runs.map(run=>({...run,text:run.text.replace(/\u00a0/gu,' ')}));}
export function blockSignature(block:Block):string {return hash({kind:block.kind,runs:nativeSpaces(block.runs),align:block.align,quoteStyle:block.quoteStyle,photo:block.photo,linkCard:block.linkCard,structure:block.structure});}
export function documentSignature(title:string,blocks:Block[]):string {return hash({title,blocks:blocks.map(b=>({kind:b.kind,runs:mergeRuns(nativeSpaces(b.runs)),align:b.align,quoteStyle:b.quoteStyle,photo:b.photo,linkCard:b.linkCard,structure:b.structure}))});}
export function mergeRuns(runs:Run[]):Run[] {const out:Run[]=[];for(const run of runs){if(!run.text)continue;const prev=out.at(-1);if(prev&&JSON.stringify(prev.marks)===JSON.stringify(run.marks))prev.text+=run.text;else out.push(structuredClone(run));}return out;}
export function sliceRuns(runs:Run[],start:number,end:number):Run[] {let cursor=0;const result:Run[]=[];for(const run of runs){const left=Math.max(0,start-cursor),right=Math.min(run.text.length,end-cursor);if(right>left)result.push({text:run.text.slice(left,right),marks:{...run.marks}});cursor+=run.text.length;if(cursor>=end)break;}return result;}
