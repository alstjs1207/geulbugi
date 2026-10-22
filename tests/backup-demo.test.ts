import { describe,it,expect } from 'vitest';
import { defaultDatabase, PRESETS } from '../src/core/defaults';
import { exportBackup,parseBackup,importBackup,hydrateDatabase } from '../src/core/backup';
import { DemoEditor,demoPosts } from '../src/platform/demo';
import { buildBreakPlan } from '../src/core/linebreak';
import { groupBlocks } from '../src/core/grouping';
describe('backups and content preservation',()=>{
 it('round trips presets including the quote preset and stored posts',()=>{const db=defaultDatabase();db.posts=demoPosts;db.settings.blogUrl='https://blog.naver.com/example_blog';const backup=parseBackup(JSON.stringify(exportBackup(db,{presets:true,rules:true,posts:true})));const restored=importBackup(defaultDatabase(),backup,true);expect(restored.presets).toEqual(db.presets);expect(restored.posts).toHaveLength(3);expect(restored.settings).toEqual(db.settings);});
 it('ignores old trial records while preserving settings, presets and posts',()=>{
  const db=defaultDatabase();db.posts=demoPosts;db.settings.blogUrl='https://blog.naver.com/example_blog';
  const legacy={...db,verifications:[{feature:'quote',stage:'failed'}]};
  expect(hydrateDatabase(legacy)).toEqual(hydrateDatabase(db));expect(hydrateDatabase(legacy)).not.toHaveProperty('verifications');
 });
 it('does not export cookies, credentials, editor text or integration grants',()=>{const db={...defaultDatabase(),cookies:'secret',password:'secret',session:'secret'};const json=JSON.stringify(exportBackup(db,{presets:true,rules:true,posts:true}));expect(json).not.toContain('secret');expect(json).not.toContain('verifications');});
 it('rejects malformed backup versions and style values',()=>{expect(()=>parseBackup('{"format":"naver-blog-helper","version":99}')).toThrow();expect(()=>parseBackup(JSON.stringify({format:'naver-blog-helper',version:1,presets:[{id:'x',name:'x',format:{color:'url(javascript:alert(1))'}}]}))).toThrow();});
 it('does not import another blog into a configured library',()=>{const db=defaultDatabase();db.settings.blogUrl='https://blog.naver.com/another_blog';expect(()=>importBackup(db,{format:'naver-blog-helper',version:1,exportedAt:'',posts:demoPosts},false)).toThrow();});
 it('does not import unsupported colors into a new preset or replace settings on failure',()=>{
  const db=defaultDatabase(),before=structuredClone(db),backup={format:'naver-blog-helper' as const,version:1 as const,exportedAt:'',presets:[{id:'custom-blue',name:'예전 파랑',description:'',format:{color:'#1c5cf2'}}]};
  expect(()=>importBackup(db,backup,false)).toThrow('예전 파랑');expect(()=>importBackup(db,backup,true)).toThrow('#1c5cf2');expect(db).toEqual(before);
 });
 it('migrates old default colors before validating an imported legacy backup',()=>{
  const db=defaultDatabase(),backup={format:'naver-blog-helper' as const,version:1 as const,exportedAt:'',presets:[{id:'emphasis',name:'강조',description:'',format:{bold:true,color:'#139B64',background:'#EAF7F0'}}]};
  expect(importBackup(db,backup,true).presets[0].format).toEqual({bold:true,color:'#00b976',background:'#c2f4db'});
 });
 it('quote formatting preserves text, existing links, photos and undo',async()=>{const editor=new DemoEditor(),before=editor.snapshot();const applied=await editor.handle({type:'format',preset:PRESETS[3]});expect(applied.ok).toBe(true);const after=editor.snapshot();expect(after.blocks.find(b=>b.id==='body-1')?.kind).toBe('quote');expect(after.linkedUrls).toEqual(before.linkedUrls);expect(after.blocks.filter(b=>b.kind==='photo')).toEqual(before.blocks.filter(b=>b.kind==='photo'));await editor.handle({type:'undo'});expect(editor.snapshot().blocks).toEqual(before.blocks);});
 it('unspecified preset attributes remain unchanged',async()=>{const editor=new DemoEditor(),before=editor.snapshot();await editor.handle({type:'format',preset:{id:'custom',name:'배경만',description:'',format:{background:'#ffff00'}}});const after=editor.snapshot();expect(after.blocks.find(b=>b.id==='body-1')?.runs.some(r=>r.marks.bold)).toBe(true);expect(after.linkedUrls).toEqual(before.linkedUrls);});
 it('photo movement preserves group, caption and count without duplication',async()=>{const editor=new DemoEditor(),before=editor.snapshot();const result=await editor.handle({type:'photo-move',photoId:'photo-3',targetId:'body-1',placement:'after'});expect(result.ok).toBe(true);const after=editor.snapshot(),i=after.blocks.findIndex(b=>b.id==='body-1');expect(after.blocks[i+1].id).toBe('photo-3');expect(after.blocks.find(b=>b.id==='photo-3')).toEqual(before.blocks.find(b=>b.id==='photo-3'));expect(after.blocks.filter(b=>b.kind==='photo')).toHaveLength(3);await editor.handle({type:'undo'});expect(editor.snapshot().blocks).toEqual(before.blocks);});
 it('linebreak apply and undo restore all rich content exactly',async()=>{const editor=new DemoEditor(),before=editor.snapshot(),plan=buildBreakPlan(before,defaultDatabase().settings.rules);const applied=await editor.handle({type:'linebreak',plan});expect(applied.ok).toBe(true);expect(editor.snapshot().linkedUrls).toEqual(before.linkedUrls);await editor.handle({type:'undo'});expect(editor.snapshot().blocks).toEqual(before.blocks);});
 it('rejects a stale preview after an intervening formatting change',async()=>{const editor=new DemoEditor(),plan=buildBreakPlan(editor.snapshot(),defaultDatabase().settings.rules);await editor.handle({type:'format',preset:PRESETS[2]});const result=await editor.handle({type:'linebreak',plan});expect(result.ok).toBe(false);});
 it('keeps plain-text blocks on opposite sides of photos separate',()=>{const editor=new DemoEditor(),snapshot=editor.snapshot(),plan=buildBreakPlan(snapshot,{...defaultDatabase().settings.rules,scope:'body'});expect(plan.changes.map(c=>c.blockId)).not.toContain('photo-1');expect(plan.changes.every(c=>snapshot.blocks.find(b=>b.id===c.blockId)?.kind==='paragraph')).toBe(true);});
 it('groups a long unheaded document into bounded sections',()=>{const source=Array.from({length:1000},(_,i)=>({id:'b'+i,kind:'paragraph' as const,text:'문단 '+i,runs:[{text:'문단 '+i,marks:{}}]}));const groups=groupBlocks(source);expect(groups).toHaveLength(50);expect(groups.every(g=>g.paragraphCount<=20)).toBe(true);expect(groups.flatMap(g=>g.blocks).map(b=>b.id)).toEqual(source.map(b=>b.id));});
});
