import type { Database } from './types';
import { hydrateDatabase } from './backup';
import { upsertPosts } from './security';
import {DEFAULT_SCHEDULE} from './schedule';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function mergeItems<T>(current:T[],base:T[],next:T[],key:(item:T)=>string):T[]{
 const before=new Map(base.map(item=>[key(item),item])),after=new Map(next.map(item=>[key(item),item]));
 const removed=new Set([...before.keys()].filter(id=>!after.has(id)));
 const changed=new Map([...after].filter(([id,item])=>!equal(item,before.get(id))));
 return [...current.filter(item=>!removed.has(key(item))).map(item=>{const id=key(item),replacement=changed.get(id);changed.delete(id);return replacement??item;}),...changed.values()];
}
// Merge only the fields changed by a writer. Background serializes extension writes.
export function mergeDatabase(current:Database,base:Database,next:Database):Database{
 const settings=structuredClone(current.settings);
 if(!equal(base.settings.blogUrl,next.settings.blogUrl))settings.blogUrl=next.settings.blogUrl;
 for(const key of Object.keys(next.settings.rules) as (keyof Database['settings']['rules'])[])
  if(!equal(base.settings.rules[key],next.settings.rules[key]))Object.assign(settings.rules,{[key]:next.settings.rules[key]});
 const shortcutKeys=new Set([...Object.keys(base.settings.shortcutPresets),...Object.keys(next.settings.shortcutPresets)]);
 for(const key of shortcutKeys)if(base.settings.shortcutPresets[key]!==next.settings.shortcutPresets[key]){
  if(next.settings.shortcutPresets[key]===undefined)delete settings.shortcutPresets[key];else settings.shortcutPresets[key]=next.settings.shortcutPresets[key];
 }
 if(!equal(base.settings.schedule,next.settings.schedule)){
  if(!next.settings.schedule)delete settings.schedule;
  else{
   const currentSchedule=settings.schedule??DEFAULT_SCHEDULE,baseSchedule=base.settings.schedule??DEFAULT_SCHEDULE;
   settings.schedule={...currentSchedule,
    ...(!equal(baseSchedule.defaultTime,next.settings.schedule.defaultTime)?{defaultTime:next.settings.schedule.defaultTime}:{}),
    ...(!equal(baseSchedule.times,next.settings.schedule.times)?{times:next.settings.schedule.times}:{})};
  }
 }
 const posts=mergeItems(current.posts,base.posts,next.posts,p=>p.url);
 const result:Database={schemaVersion:1,settings,presets:mergeItems(current.presets,base.presets,next.presets,p=>p.id),posts:upsertPosts([],posts).posts};
 return hydrateDatabase(result);
}
