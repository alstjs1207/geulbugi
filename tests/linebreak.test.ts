import { describe,it,expect } from 'vitest';
import { sentenceBoundaries,wrapRuns,buildBreakPlan } from '../src/core/linebreak';
import { defaultDatabase } from '../src/core/defaults';
import { DemoEditor } from '../src/platform/demo';
import type { Run } from '../src/core/types';
const rules={...defaultDatabase().settings.rules,longLength:120};
const text=(runs:Run[])=>runs.map(r=>r.text).join('');
const flatten=(runs:Run[])=>runs.flatMap(r=>Array.from(r.text).filter(c=>!/\s/u.test(c)).map(c=>({c,marks:r.marks})));
describe('rule based rich-text line breaks',()=>{
 it('separates one or two sentences without changing words',()=>{const source='첫 문장이에요. 다음 문장이에요. 마지막 문장이에요.';const one=text(wrapRuns([{text:source,marks:{}}],rules).runs);expect(one).toBe('첫 문장이에요. \n\n다음 문장이에요. \n\n마지막 문장이에요.');expect(text(wrapRuns([{text:source,marks:{}}],{...rules,sentences:2}).runs)).toBe('첫 문장이에요. 다음 문장이에요. \n\n마지막 문장이에요.');});
 it('preserves decimal and date punctuation',()=>{const source='가격은 3.14원이고 2026.10.06에 방문했어요. 다음 내용이에요.';expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);});
 it('protects URLs including dots and query strings',()=>{const source='https://blog.naver.com/example_blog/10001?x=3.14 를 확인해요. 다음 내용이에요.';expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);});
 it('preserves abbreviations',()=>{const source='Dr. Kim을 만났어요. 다음 문장이에요.';expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);});
 it('does not split inside quoted sentences',()=>{const source='“정말 좋았어요. 다음에도 와요.”라고 말했어요. 함께 걸었어요.';expect(sentenceBoundaries(source)).toEqual([source.indexOf('함께')]);});
 it('keeps existing manual line breaks',()=>{const source='첫 줄이에요.\n두 번째 줄이에요.';expect(text(wrapRuns([{text:source,marks:{}}],rules).runs)).toBe(source);});
 it('preserves bold, color and ordinary hyperlinks after splitting',()=>{const source:Run[]=[{text:'아이와 함께 ',marks:{bold:true,color:'#139B64'}},{text:'산책했어요. 다음 코스는 ',marks:{}},{text:'지난 산책 기록',marks:{href:'https://blog.naver.com/example_blog/10003'}},{text:'에 있어요. 다시 걸어요.',marks:{}}];const result=wrapRuns(source,{...rules,longLength:18}).runs;expect(flatten(result)).toEqual(flatten(source));});
 it('does not break an unbroken URL to meet a character count',()=>{const source='https://blog.naver.com/example_blog/10001';expect(text(wrapRuns([{text:source,marks:{}}],{...rules,longLength:10}).runs)).toBe(source);});
 it('counts emoji without splitting surrogate pairs',()=>{const source='아이와 🌳🌳🌳🌳🌳 숲길을 천천히 걸어요.';const result=text(wrapRuns([{text:source,marks:{}}],{...rules,longLength:10}).runs);expect(result.replace(/\n/g,'')).toBe(source);expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);});
 it('excludes headings, quotations, tables, captions and photos',()=>{const editor=new DemoEditor(),snap=editor.snapshot();const plan=buildBreakPlan(snap,{...rules,scope:'body'});expect(plan.changes.every(c=>snap.blocks.find(b=>b.id===c.blockId)?.kind==='paragraph')).toBe(true);expect(plan.excluded).toBeGreaterThanOrEqual(5);});
 it('restricts reflow to a selected plain-text range',()=>expect(()=>buildBreakPlan(new DemoEditor().snapshot(),{...rules,scope:'body',reflow:true,preserveExisting:false})).toThrow());
 it('preview and cancel leave the document unchanged',()=>{const editor=new DemoEditor(),before=editor.snapshot();buildBreakPlan(before,rules);expect(editor.snapshot()).toEqual(before);});
 it('refuses an empty selection',()=>{const editor=new DemoEditor();editor.select('body-1',0,0);expect(()=>buildBreakPlan(editor.snapshot(),rules)).toThrow();});
});
describe('additional punctuation exceptions',()=>{
 it('preserves spaced Korean dates and thousand separators',()=>{
  const source='2026. 10. 07. 오전에 12,345원으로 샀어요. 다음 내용이에요.';
  expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);
 });
 it('protects single quoted sentences while allowing English contractions',()=>{
  const source="그는 '좋아요. 또 와요.'라고 말했어요. 다음 내용이에요.";
  expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);expect(sentenceBoundaries("Don't split this. Next sentence.")).toHaveLength(1);
 });
});
