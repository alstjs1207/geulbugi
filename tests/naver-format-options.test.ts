import {describe,it,expect} from 'vitest';
import {PRESETS,defaultDatabase} from '../src/core/defaults';
import {assertNaverFormat,migrateDefaultColors,isNaverColor,NAVER_COLORS,naverFormatIssue} from '../src/core/naver-format-options';
import {hydrateDatabase} from '../src/core/backup';
describe('public Naver formatting support',()=>{
 it('only ships defaults supported by the observed native menus',()=>{for(const preset of PRESETS)expect(()=>assertNaverFormat(preset.format)).not.toThrow();});
 it('rejects unsupported properties before partial formatting can begin',()=>{expect(()=>assertNaverFormat({fontSize:17})).toThrow('글자 크기');expect(()=>assertNaverFormat({bold:true,color:'#202824'})).toThrow('#202824');expect(()=>assertNaverFormat({color:'#00B976'})).not.toThrow();});
 it('migrates old built-in colors while preserving user size, alignment and other settings',()=>{
  const db=defaultDatabase();db.presets[1].format={fontSize:16,color:'#202824',bold:true,align:'center'};db.settings.blogUrl='https://blog.naver.com/example_blog';
  const loaded=hydrateDatabase(db);expect(loaded.presets[1].format).toEqual({fontSize:16,color:'#141414',bold:true,align:'center'});expect(loaded.settings).toEqual(db.settings);
 });
 it('leaves arbitrary custom colors and custom preset IDs intact',()=>{
  expect(migrateDefaultColors({id:'custom',name:'내 서식',description:'',format:{color:'#202824'}}).format.color).toBe('#202824');
  expect(migrateDefaultColors({id:'heading',name:'소제목',description:'',format:{color:'#123456'}}).format.color).toBe('#123456');
 });
 it('lists the observed palette without arbitrary user colors and accepts uppercase supported values',()=>{
  expect(NAVER_COLORS).toHaveLength(71);expect(new Set(NAVER_COLORS).size).toBe(71);expect(isNaverColor('#1c5cf2')).toBe(false);expect(isNaverColor('#00B976')).toBe(true);expect(NAVER_COLORS.every(color=>/^#[0-9a-f]{6}$/.test(color))).toBe(true);
 });
 it('reports unsupported legacy colors without changing saved presets',()=>{
  const db=defaultDatabase();db.presets[2].format.color='#1c5cf2';const loaded=hydrateDatabase(db);expect(loaded.presets[2].format.color).toBe('#1c5cf2');expect(naverFormatIssue(loaded.presets[2].format)).toContain('#1c5cf2');
 });
 it('rejects unsupported quote options before the native editor is touched',()=>{
  expect(()=>assertNaverFormat({paragraphStyle:'quote',align:'right'})).toThrow('왼쪽 또는 가운데');expect(()=>assertNaverFormat({paragraphStyle:'quote',background:'#ffffff'})).toThrow('배경색');expect(()=>assertNaverFormat({paragraphStyle:'quote',align:'center',color:'#555555'})).not.toThrow();
 });
});
