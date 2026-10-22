import {describe,it,expect} from 'vitest';
import {defaultDatabase,PRESETS} from '../src/core/defaults';
import {hydrateDatabase,exportBackup,parseBackup,importBackup} from '../src/core/backup';
import {mergeDatabase} from '../src/core/merge-database';
import {koreanDate,nextSchedule,shiftScheduleDate,validatePublishTime,validateSchedulePreferences} from '../src/core/schedule';
import {DemoEditor} from '../src/platform/demo';

const now=Date.parse('2026-10-11T08:20:05Z');
describe('Korean reservation dates and times',()=>{
 it('uses the Korean day across midnight regardless of the computer timezone',()=>{
  expect(koreanDate(Date.parse('2026-10-11T15:00:00Z'))).toBe('2026-10-12');
  expect(koreanDate(Date.parse('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
 });
 it('keeps a future favorite today and advances a past favorite to tomorrow',()=>{
  expect(nextSchedule('18:00',now)).toEqual({mode:'scheduled',date:'2026-10-11',time:'18:00'});
  expect(nextSchedule('09:00',now)).toEqual({mode:'scheduled',date:'2026-10-12',time:'09:00'});
  expect(nextSchedule('17:20',now).date).toBe('2026-10-12');
 });
 it('advances dates across month, year and leap-day boundaries',()=>{
  expect(shiftScheduleDate('2026-12-31',1)).toBe('2027-01-01');
  expect(shiftScheduleDate('2028-02-28',1)).toBe('2028-02-29');
  expect(shiftScheduleDate('2026-02-28',7)).toBe('2026-03-07');
 });
 it.each(['2026-02-29','2026-10-32','2026-13-01','2026-2-01'])('rejects nonexistent or malformed date %s',date=>{
  expect(()=>validatePublishTime({mode:'scheduled',date,time:'09:00'},now)).toThrow(/날짜/);
 });
 it.each(['09:05','24:00','9:00','10:60','18:01'])('rejects unsupported time %s',time=>{
  expect(()=>validatePublishTime({mode:'scheduled',date:'2026-10-12',time},now)).toThrow(/10분/);
 });
 it('blocks passed minutes and past days and accepts the next ten-minute slot',()=>{
  expect(()=>validatePublishTime({mode:'scheduled',date:'2026-10-11',time:'17:20'},now)).toThrow(/뒤/);
  expect(()=>validatePublishTime({mode:'scheduled',date:'2026-10-10',time:'23:50'},now)).toThrow(/뒤/);
  expect(validatePublishTime({mode:'scheduled',date:'2026-10-11',time:'17:30'},now)).toEqual({mode:'scheduled',date:'2026-10-11',time:'17:30'});
  expect(validatePublishTime({mode:'now'},now)).toEqual({mode:'now'});
 });
});
describe('reservation preferences and existing backups',()=>{
 it('reads old databases without changing existing settings or presets',()=>{
  const before=defaultDatabase();expect(hydrateDatabase(before)).toEqual(before);
  expect(hydrateDatabase(before).settings.schedule).toBeUndefined();
 });
 it('round trips favorites through storage and backup while keeping the old settings when chosen',()=>{
  const original=defaultDatabase(),next=structuredClone(original);next.settings.schedule={defaultTime:'10:20',times:['10:20','18:00']};
  const backup=parseBackup(JSON.stringify(exportBackup(next,{presets:true,rules:true,posts:true})));
  expect(importBackup(original,backup,false)).toEqual(original);
  expect(importBackup(original,backup,true)).toEqual(next);
  expect(hydrateDatabase(next)).toEqual(next);
 });
 it('validates and deduplicates favorites and rejects invalid imported settings',()=>{
  expect(validateSchedulePreferences({defaultTime:'09:00',times:['09:00','09:00']})).toEqual({defaultTime:'09:00',times:['09:00']});
  expect(()=>validateSchedulePreferences({defaultTime:'09:00',times:['09:05']})).toThrow();
  expect(()=>validateSchedulePreferences({defaultTime:'09:00',times:Array(9).fill('09:00')})).toThrow();
  expect(()=>hydrateDatabase({...defaultDatabase(),settings:{...defaultDatabase().settings,schedule:{defaultTime:'24:00',times:[]}}})).toThrow();
 });
 it('merges changes without overwriting concurrently saved favorites or other settings',()=>{
  const base=defaultDatabase();base.settings.schedule={defaultTime:'09:00',times:['09:00']};
  const current=structuredClone(base),next=structuredClone(base);current.settings.schedule!.times.push('18:00');current.settings.blogUrl='https://blog.naver.com/example_blog';next.settings.schedule!.defaultTime='12:00';
  const result=mergeDatabase(current,base,next);
  expect(result.settings.schedule).toEqual({defaultTime:'12:00',times:['09:00','18:00']});
  expect(result.settings.blogUrl).toBe(current.settings.blogUrl);
 });
 it('merges the first default-time save with favorites added by another panel',()=>{
  const base=defaultDatabase(),current=structuredClone(base),next=structuredClone(base);
  current.settings.schedule={defaultTime:'09:00',times:['09:00','12:00','18:00','22:10']};
  next.settings.schedule={defaultTime:'10:20',times:['09:00','12:00','18:00']};
  expect(mergeDatabase(current,base,next).settings.schedule).toEqual({defaultTime:'10:20',times:current.settings.schedule.times});
 });
});
it('changes only publishing time in the demo and preserves the previous body undo',async()=>{
 const editor=new DemoEditor(),initial=editor.snapshot();await editor.handle({type:'format',preset:PRESETS[2]});const formatted=editor.snapshot();
 const value=nextSchedule('18:00');
 const result=await editor.handle({type:'publish-time',value,expected:formatted});
 expect(result.ok).toBe(true);expect(editor.snapshot().publishTime).toEqual(value);expect(editor.snapshot().blocks).toEqual(formatted.blocks);expect(editor.snapshot().canUndo).toBe(true);
 await editor.handle({type:'undo'});expect(editor.snapshot().blocks).toEqual(initial.blocks);expect(editor.snapshot().publishTime).toEqual(value);
 expect((await editor.handle({type:'publish-time',value:{mode:'now'},expected:formatted})).ok).toBe(false);
});
