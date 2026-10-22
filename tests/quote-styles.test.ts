import {describe,it,expect} from 'vitest';
import {defaultDatabase} from '../src/core/defaults';
import {exportBackup,parseBackup,importBackup,hydrateDatabase,validatePreset} from '../src/core/backup';
import {assertNaverFormat,NAVER_QUOTE_STYLES,resolveQuoteStyle} from '../src/core/naver-format-options';
import {blockSignature,documentSignature} from '../src/core/hash';
import {DemoEditor} from '../src/platform/demo';
import {verifyPostconditions} from '../src/editor/postconditions';
import type {Format} from '../src/core/types';

describe('quotation layout storage and verification',()=>{
 it('accepts native NBSP serialization while still detecting lost spaces and glyph changes',()=>{
  const block=new DemoEditor().snapshot().blocks.find(b=>b.kind==='quote')!;
  const source={...block,runs:[{text:'검수\u00a0출처',marks:{bold:true}}]},saved={...block,runs:[{text:'검수 출처',marks:{bold:true}}]};
  expect(blockSignature(source)).toBe(blockSignature(saved));
  expect(documentSignature('초안',[source])).toBe(documentSignature('초안',[saved]));
  for(const changed of [{...saved,runs:[{text:'검수출처',marks:{bold:true}}]},{...saved,runs:[{text:'검수  출처',marks:{bold:true}}]},{...saved,runs:[{text:'검수 출처',marks:{bold:false}}]}]){
   expect(blockSignature(changed)).not.toBe(blockSignature(source));
   expect(documentSignature('초안',[changed])).not.toBe(documentSignature('초안',[source]));
  }
 });
 it('retains all six native shapes through local hydration and backup import',()=>{
  const db=defaultDatabase();db.presets=NAVER_QUOTE_STYLES.map(option=>({id:option.value,name:option.name,description:'',format:{paragraphStyle:'quote',quoteStyle:option.value,color:'#555555'}}));
  expect(hydrateDatabase(db).presets).toEqual(db.presets);
  expect(importBackup(defaultDatabase(),parseBackup(JSON.stringify(exportBackup(db,{presets:true,rules:false,posts:false}))),true).presets).toEqual(db.presets);
 });
 it('rejects unknown layouts instead of discarding them from imported presets',()=>{
  expect(()=>validatePreset({id:'bad',name:'미지원',format:{paragraphStyle:'quote',quoteStyle:'unknown'}})).toThrow('인용구 모양');
  expect(()=>assertNaverFormat({paragraphStyle:'quote',quoteStyle:'unknown'} as unknown as Format)).toThrow('인용구 모양');
  expect(()=>assertNaverFormat({paragraphStyle:'body',quoteStyle:'default'})).toThrow('문단 스타일');
  expect(()=>assertNaverFormat({paragraphStyle:'quote',quoteStyle:'quotation_bubble',align:'left'})).toThrow('기본 정렬');
 });
 it('keeps legacy alignment behavior and preserves existing shapes when layout is unspecified',()=>{
  expect(resolveQuoteStyle({paragraphStyle:'quote',align:'left'})).toBe('quotation_line');expect(resolveQuoteStyle({paragraphStyle:'quote',align:'center'})).toBe('default');
  expect(resolveQuoteStyle({paragraphStyle:'quote'},{kind:'quote',quoteStyle:'quotation_bubble',align:'left'})).toBe('quotation_bubble');
 });
 for(const option of NAVER_QUOTE_STYLES)it('applies '+option.name+' and restores the exact document on undo',async()=>{
  const editor=new DemoEditor(),before=editor.snapshot(),preset={id:'quote',name:option.name,description:'',format:{paragraphStyle:'quote' as const,quoteStyle:option.value}};
  expect((await editor.handle({type:'format',preset})).ok).toBe(true);const after=editor.snapshot();expect(after.blocks.find(b=>b.id===before.selection!.blockId)?.quoteStyle).toBe(option.value);
  expect(()=>verifyPostconditions(before,after,{type:'format',preset})).not.toThrow();expect(after.linkedUrls).toEqual(before.linkedUrls);expect(after.blocks.filter(b=>b.kind==='photo')).toEqual(before.blocks.filter(b=>b.kind==='photo'));
  expect((await editor.handle({type:'undo'})).ok).toBe(true);expect(editor.snapshot().revision).toBe(before.revision);expect(editor.snapshot().blocks).toEqual(before.blocks);
 });
 it('checks requested and unrelated quotation shapes even when all text and glyphs match',()=>{
  const before=new DemoEditor().snapshot(),after=structuredClone(before),selected=after.blocks.find(b=>b.id===before.selection!.blockId)!;
  selected.kind='quote';selected.quoteStyle='quotation_line';const request={type:'format' as const,preset:{id:'quote',name:'프레임',description:'',format:{paragraphStyle:'quote' as const,quoteStyle:'quotation_corner' as const}}};
  expect(()=>verifyPostconditions(before,after,request)).toThrow('인용구 모양');selected.quoteStyle='quotation_corner';expect(()=>verifyPostconditions(before,after,request)).not.toThrow();
  after.blocks.find(b=>b.id==='quote-1')!.quoteStyle='default';expect(()=>verifyPostconditions(before,after,request)).toThrow('선택하지 않은');
 });
 it('includes layout-only changes in document and selection signatures',()=>{
  const before=new DemoEditor().snapshot(),block=before.blocks.find(b=>b.kind==='quote')!,changed={...block,quoteStyle:'quotation_bubble'};
  expect(blockSignature(changed)).not.toBe(blockSignature(block));expect(documentSignature(before.title,before.blocks.map(b=>b.id===block.id?changed:b))).not.toBe(before.revision);
 });
});
