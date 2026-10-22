import {describe,it,expect} from 'vitest';
import {DemoEditor,demoPosts} from '../src/platform/demo';
import {verifyPostconditions} from '../src/editor/postconditions';
import {documentSignature} from '../src/core/hash';
import type {Block,Snapshot} from '../src/core/types';

const request={type:'link' as const,post:demoPosts[0]};
async function insert(offset:number){
 const editor=new DemoEditor(),source=editor.snapshot().blocks[0];editor.select(source.id,offset,offset);
 const before=editor.snapshot(),result=await editor.handle(request);expect(result.ok).toBe(true);
 return {editor,before,after:editor.snapshot()};
}
describe('preview card insertion and body preservation',()=>{
 for(const offset of [0,8,63])it('inserts a card at the cursor and preserves both sides at offset '+offset,async()=>{
  const {editor,before,after}=await insert(Math.min(offset,new DemoEditor().snapshot().blocks[0].text.length));
  expect(()=>verifyPostconditions(before,after,request)).not.toThrow();
  expect(after.blocks.filter(b=>b.kind==='link-card')).toHaveLength(1);
  expect(after.linkedUrls).toContain(request.post.url);expect(after.blocks.filter(b=>b.kind==='photo')).toEqual(before.blocks.filter(b=>b.kind==='photo'));
  await editor.handle({type:'undo'});expect(editor.snapshot().revision).toBe(before.revision);expect(editor.snapshot().blocks).toEqual(before.blocks);
 });
 it('allows another card at the empty paragraph cursor left by the preceding insertion',async()=>{
  const {editor}=await insert(0),before=editor.snapshot(),next={type:'link' as const,post:demoPosts[1]};
  expect(before.blocks.find(b=>b.id===before.selection?.blockId)?.text).not.toBeUndefined();
  // Insert at the end, where the editor creates an empty following paragraph.
  const source=before.blocks.filter(b=>b.kind==='paragraph').at(-1)!;editor.select(source.id,source.text.length,source.text.length);
  const atEnd=editor.snapshot();await editor.handle(next);expect(()=>verifyPostconditions(atEnd,editor.snapshot(),next)).not.toThrow();
  const empty=editor.snapshot().blocks.find(b=>b.id===editor.snapshot().selection?.blockId)!;expect(empty.text).toBe('');
  const third={type:'link' as const,post:{...demoPosts[0],postId:'10004',url:'https://blog.naver.com/example_blog/10004'}};
  const emptyBefore=editor.snapshot();expect((await editor.handle(third)).ok).toBe(true);expect(()=>verifyPostconditions(emptyBefore,editor.snapshot(),third)).not.toThrow();
 });
 it('prevents duplicate cards without adding an undo entry',async()=>{
  const {editor}=await insert(8),before=editor.snapshot();expect((await editor.handle(request)).ok).toBe(false);expect(editor.snapshot().revision).toBe(before.revision);
  await editor.handle({type:'undo'});expect(editor.snapshot().blocks.some(b=>b.kind==='link-card')).toBe(false);
 });
 it('rejects a title hyperlink in place of a preview card',async()=>{
  const {before}=await insert(0),after=structuredClone(before);after.blocks[0].runs.unshift({text:request.post.title,marks:{href:request.post.url}});
  expect(()=>verifyPostconditions(before,after,request)).toThrow(/카드/);
 });
 it('rejects a valid card inserted at a different paragraph',async()=>{
  const {before,after}=await insert(8),index=after.blocks.findIndex(b=>b.kind==='link-card'),[card]=after.blocks.splice(index,1);after.blocks.push(card);
  expect(()=>verifyPostconditions(before,after,request)).toThrow(/커서 위치/);
 });
 for(const change of ['text','mark','photo','table'] as const)it('rejects lost or changed original '+change,async()=>{
  const {before,after}=await insert(8);
  if(change==='text')after.blocks[0].runs[0].text+='추가됨';
  if(change==='mark')after.blocks[0].runs[0].marks.bold=true;
  if(change==='photo')after.blocks.find(b=>b.kind==='photo')!.photo!.caption='변경됨';
  if(change==='table')after.blocks.find(b=>b.kind==='table')!.runs[0].text='변경됨';
  expect(()=>verifyPostconditions(before,after,request)).toThrow(/보존/);
 });
 it('allows the fetched title to differ from stale local metadata, and normalizes mobile URLs',async()=>{
  const {before,after}=await insert(8),card=after.blocks.find(b=>b.kind==='link-card')!;card.linkCard!.title='현재 게시글 제목';card.linkCard!.url='https://m.blog.naver.com/example_blog/10001?trackingCode=test';
  expect(()=>verifyPostconditions(before,after,request)).not.toThrow();
 });
 it('includes card metadata in the revision used to protect undo and old cards',async()=>{
  const {before,after}=await insert(8),revision=documentSignature(after.title,after.blocks);after.blocks.find(b=>b.kind==='link-card')!.linkCard!.url=demoPosts[1].url;
  expect(documentSignature(after.title,after.blocks)).not.toBe(revision);expect(()=>verifyPostconditions(before,after,request)).toThrow(/주소/);
 });
 for(const text of ['', '\n', '   '])it('inserts in an empty or whitespace paragraph '+JSON.stringify(text),()=>{
  const template=new DemoEditor().snapshot(),source:Block={id:'blank',kind:'paragraph',text,runs:text?[{text,marks:{}}]:[],align:'left'},offset=text==='   '?1:0;
  const before:Snapshot={...template,blocks:[source],selection:{blockId:'blank',endBlockId:'blank',start:offset,end:offset,text:'',signature:'unit-test',valid:true,collapsed:true}};
  const paragraph=(id:string,value:string):Block=>({...source,id,text:value,runs:value?[{text:value,marks:{}}]:[]});
  const card:Block={id:'card',kind:'link-card',text:request.post.title,runs:[],linkCard:{url:request.post.url,title:request.post.title,description:''}};
  const after:Snapshot={...before,blocks:[paragraph('left',text.slice(0,offset)),card,paragraph('right',text.slice(offset))]};
  expect(()=>verifyPostconditions(before,after,request)).not.toThrow();
 });
});
