import {describe,it,expect} from 'vitest';
import {verifyPostconditions} from '../src/editor/postconditions';
import {DemoEditor} from '../src/platform/demo';
import {defaultDatabase} from '../src/core/defaults';
import {mergeDatabase} from '../src/core/merge-database';
import {wrapRuns} from '../src/core/linebreak';
describe('native result checks without pretending to test Naver',()=>{
 it('rejects lost bold and ordinary links during a paragraph split',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before),body=after.blocks.find(b=>b.id==='body-1')!;
  body.runs=body.runs.map(r=>({text:r.text,marks:{}}));
  expect(()=>verifyPostconditions(before,after,{type:'linebreak',plan:{revision:before.revision,documentKey:before.documentKey,rules:defaultDatabase().settings.rules,changes:[],excluded:0,originalText:'',resultText:'',contentPreserved:true}})).toThrow(/서식/);
 });
 it('accepts a specified color in rgb form while preserving all other marks',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before);
  after.blocks.find(b=>b.id==='body-1')!.runs.forEach(r=>r.marks.color='rgb(19, 155, 100)');
  expect(()=>verifyPostconditions(before,after,{type:'format',preset:{id:'color',name:'색상만',description:'',format:{color:'#139B64'}}})).not.toThrow();
 });
 it('rejects an unintended bold change in a color-only preset',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before);
  after.blocks.find(b=>b.id==='body-1')!.runs.forEach(r=>{r.marks.color='#139B64';r.marks.bold=false;});
  expect(()=>verifyPostconditions(before,after,{type:'format',preset:{id:'color',name:'색상만',description:'',format:{color:'#139B64'}}})).toThrow();
 });
 it('detects table changes during a photo move',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before);
  after.blocks.find(b=>b.kind==='table')!.runs=[{text:'바뀐 표',marks:{}}];
  expect(()=>verifyPostconditions(before,after,{type:'photo-move',photoId:'photo-1',targetId:'body-2',placement:'after'})).toThrow();
 });
});
describe('independent writers preserve locally stored records',()=>{
 it('merges a settings change with a concurrent preset change',()=>{
  const base=defaultDatabase(),settings=structuredClone(base),record=structuredClone(base);
  settings.settings.blogUrl='https://blog.naver.com/example_blog';record.presets[0].name='내 본문';
  const merged=mergeDatabase(mergeDatabase(base,base,settings),base,record);
  expect(merged.settings.blogUrl).toBe(settings.settings.blogUrl);expect(merged.presets[0].name).toBe('내 본문');
 });
 it('preserves two changed rule fields from independent settings writers',()=>{
  const base=defaultDatabase(),one=structuredClone(base),two=structuredClone(base);one.settings.rules.longLength=40;two.settings.rules.blankLines=2;
  const merged=mergeDatabase(mergeDatabase(base,base,one),base,two);
  expect(merged.settings.rules.longLength).toBe(40);expect(merged.settings.rules.blankLines).toBe(2);
 });
 it('keeps unrelated presets when another preset is edited or deleted',()=>{
  const base=defaultDatabase(),added=structuredClone(base),removed=structuredClone(base);
  added.presets.push({id:'custom',name:'사용자 프리셋',description:'',format:{bold:true}});
  removed.presets=removed.presets.filter(p=>p.id!=='body');
  const merged=mergeDatabase(mergeDatabase(base,base,added),base,removed);
  expect(merged.presets.some(p=>p.id==='custom')).toBe(true);expect(merged.presets.some(p=>p.id==='body')).toBe(false);
 });
});
describe('long quotations stay together',()=>{
 it('does not split a quoted phrase just to meet a length limit',()=>{
  const source='그는 “아이와 천천히 걸으면 숲길에서 더 많은 것을 볼 수 있어요.”라고 말했어요. 함께 걸어요.';
  const result=wrapRuns([{text:source,marks:{}}],{...defaultDatabase().settings.rules,longLength:10}).runs.map(r=>r.text).join('');
  const quotation='“아이와 천천히 걸으면 숲길에서 더 많은 것을 볼 수 있어요.”';
  expect(result).toContain(quotation);expect(result.replace(/\n/g,'')).toBe(source);
 });
});
describe('requested paragraph structure is checked',()=>{
 it('rejects an alignment that was not actually applied',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before);
  expect(()=>verifyPostconditions(before,after,{type:'format',preset:{id:'center',name:'가운데',description:'',format:{align:'center'}}})).toThrow(/정렬/);
 });
 it('does not accept an unchanged plain paragraph as a quote',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before);
  expect(()=>verifyPostconditions(before,after,{type:'format',preset:{id:'quote',name:'인용구',description:'',format:{paragraphStyle:'quote'}}})).toThrow(/스타일/);
 });
});
