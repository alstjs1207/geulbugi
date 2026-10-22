import {describe,it,expect} from 'vitest';
import {wrapRuns,sentenceBoundaries} from '../src/core/linebreak';
import {defaultDatabase} from '../src/core/defaults';
import {parseBackup,exportBackup,importBackup,hydrateDatabase} from '../src/core/backup';
import type {Run} from '../src/core/types';
const rules={...defaultDatabase().settings.rules,longLength:24};
const wrap=(text:string,limit=24,mode:'meaning'|'length'='meaning')=>wrapRuns([{text,marks:{}}],{...rules,longLength:limit,longMode:mode}).runs.map(r=>r.text).join('');
describe('meaning-first paragraph wrapping',()=>{
 it('keeps a long modifier and noun phrase together when there is no safe clause',()=>{
  const source='아이와 함께 걷기 좋은 가을 숲길을 천천히 둘러보는 시간을 가져보세요.';
  expect(wrap(source,18)).toBe(source);expect(wrap(source,18,'length')).toContain('\n');
 });
 it('chooses a connective clause rather than the nearest space',()=>{
  expect(wrap('날씨가 선선해서 산책하기 좋지만 아이가 피곤해하면 가까운 벤치에서 쉬어가세요.')).toBe('날씨가 선선해서 산책하기 좋지만 \n아이가 피곤해하면 가까운 벤치에서 쉬어가세요.');
 });
 it('uses a comma clause even when it exceeds the length goal',()=>{
  const source='아이와 함께 천천히 산책로를 걸어가세요, 중간에 벤치가 보이면 잠시 쉬어가세요.';
  expect(wrap(source,14)).toBe('아이와 함께 천천히 산책로를 걸어가세요, \n중간에 벤치가 보이면 잠시 쉬어가세요.');
 });
 it('breaks before an explicit transition',()=>{
  expect(wrap('준비한 재료를 한곳에 모아주세요 그리고 아이가 직접 고를 시간을 충분히 주세요.',18)).toBe('준비한 재료를 한곳에 모아주세요 \n그리고 아이가 직접 고를 시간을 충분히 주세요.');
 });
 it.each(['가방을 정리하고 나서 아이의 상태를 먼저 확인해 주세요.','혼자 할 수 있는 쉬운 만들기 놀이를 함께 골라보세요.','아름다운 동네 풍경과 작은 가게를 천천히 둘러보세요.'])('does not split dependent expressions or arbitrary spaces: %s',source=>expect(wrap(source,12)).toBe(source));
 it('keeps an auxiliary expression together while allowing a following clause break',()=>{
  expect(wrap('충분히 산책하고 있어서 오늘은 집에서 쉬어도 괜찮습니다.',12)).toBe('충분히 산책하고 있어서 \n오늘은 집에서 쉬어도 괜찮습니다.');
 });
 it('does not infer a verb boundary from nouns ending in 고',()=>{
  const source='이번 주말에는 최고의 재고 관리 방법을 새로운 창고 담당자에게 알려주세요.';
  expect(wrap(source,15)).toBe(source);
 });
 it('protects parenthetical clauses, quotes, links, dates and numbers',()=>{
  const source='안내문(비가 오지만 실내에서는 놀이를 계속합니다)을 읽고 2026. 10. 19.에 12,345원을 확인하세요. 다음 문장입니다.';
  const result=wrap(source,12);
  expect(result).toContain('(비가 오지만 실내에서는 놀이를 계속합니다)');expect(result).toContain('2026. 10. 19.');expect(result).toContain('12,345원');
  expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);
 });
 it('keeps rich marks, hyperlink boundaries, emoji and original characters',()=>{
  const input:Run[]=[{text:'아이와 함께 걸어가지만 ',marks:{bold:true}},{text:'안전하고 편안한 🌳 숲길 안내',marks:{href:'https://blog.naver.com/example_blog/10001',color:'#0078cb'}},{text:'를 먼저 확인하고 천천히 이동해 주세요.',marks:{italic:true}}];
  const result=wrapRuns(input,{...rules,longLength:16});
  const chars=(runs:Run[])=>runs.flatMap(r=>Array.from(r.text).filter(c=>c!=='\n').map(c=>({c,marks:r.marks})));
  expect(chars(result.runs)).toEqual(chars(input));expect(result.runs.find(r=>r.marks.href)?.text).toBe(input[1].text);
 });
 it('recognizes NBSP after a sentence without leaving it before the next text',()=>{
  const source='첫 문장입니다.\u00a0다음 문장입니다.';
  expect(sentenceBoundaries(source)).toEqual([source.indexOf('다음')]);expect(wrap(source)).toBe('첫 문장입니다.\u00a0\n\n다음 문장입니다.');
 });
 it('preserves manual line breaks and does not append extra blank lines',()=>{
  const source='아이와 함께 숲길을 걸어보세요.\n다음 날에는 실내에서 쉬어보세요.';
  expect(wrap(source,12)).toBe(source);
 });
});
describe('saved linebreak modes and backup size boundaries',()=>{
 it('migrates old rules to meaning mode and round-trips an explicit length choice',()=>{
  const db=defaultDatabase();delete db.settings.rules.longMode;
  expect(hydrateDatabase(db).settings.rules.longMode).toBe('meaning');
  db.settings.rules.longMode='length';const backup=parseBackup(JSON.stringify(exportBackup(db,{presets:true,rules:true,posts:true})));
  expect(importBackup(defaultDatabase(),backup,true).settings.rules.longMode).toBe('length');
 });
 it('round-trips a library merged past 100 presets and still rejects duplicate IDs',()=>{
  const db=defaultDatabase(),incoming=Array.from({length:120},(_,i)=>({...db.presets[0],id:'extra-'+i,name:'추가 '+i}));
  const merged=importBackup(db,{format:'naver-blog-helper',version:1,exportedAt:'',presets:incoming},false);
  expect(parseBackup(JSON.stringify(exportBackup(merged,{presets:true,rules:false,posts:false}))).presets).toHaveLength(124);
  expect(()=>parseBackup(JSON.stringify({format:'naver-blog-helper',version:1,presets:[incoming[0],incoming[0]]}))).toThrow(/중복/);
 });
 it('continues rejecting over-20MB backups and invalid modes',()=>{
  expect(()=>parseBackup(' '.repeat(20*1024*1024+1))).toThrow(/20MB/);
  const db=defaultDatabase();Object.assign(db.settings.rules,{longMode:'anything'});expect(()=>hydrateDatabase(db)).toThrow(/규칙/);
 });
});
