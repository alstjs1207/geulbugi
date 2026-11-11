import type { Database } from '../core/types';
import { defaultDatabase } from '../core/defaults';
import { validateSettings,validatePreset,hydrateDatabase } from '../core/backup';
import { mergeDatabase } from '../core/merge-database';
import {migrateDefaultColors} from '../core/naver-format-options';
import { normalizeBlog } from '../core/security';
export const STORAGE_KEY='naver-blog-helper:v1';
export const isExtension=()=>typeof chrome!=='undefined'&&!!chrome.runtime?.id;
export async function loadDatabase():Promise<Database>{
 const raw=isExtension()?(await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]:JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
 return raw?hydrateDatabase(raw):defaultDatabase();
}
// A command needs current settings/presets, not validation of every saved post.
// Read storage on every invocation so edits in other panels take effect at once.
export async function loadShortcutConfiguration():Promise<Pick<Database,'settings'|'presets'>>{
 const raw=isExtension()?(await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]:JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
 if(!raw)return defaultDatabase();
 if(raw.schemaVersion!==1)throw new Error('지원하지 않는 저장 자료 버전이에요. 백업을 확인해 주세요.');
 return {settings:validateSettings(raw.settings),presets:raw.presets.map(validatePreset).map(migrateDefaultColors)};
}
async function writeDatabase(db:Database):Promise<void>{
 const raw=JSON.stringify(db);
 if(new TextEncoder().encode(raw).length>8*1024*1024)throw new Error('저장 자료가 커졌어요. 백업 후 오래된 발췌를 정리해 주세요.');
 if(isExtension())await chrome.storage.local.set({[STORAGE_KEY]:db});else localStorage.setItem(STORAGE_KEY,raw);
}
export async function saveDatabase(next:Database,base?:Database):Promise<void>{
 if(isExtension()&&base){
  const response=await chrome.runtime.sendMessage({type:'STORE_DATABASE_DIFF',base,next});
  if(!response?.ok)throw new Error(response?.error??'설정을 저장하지 못했어요.');
 }else await writeDatabase(next);
}
let writes:Promise<unknown>=Promise.resolve();
export function commitDatabaseDiff(base:Database,next:Database):Promise<Database>{
 const task=writes.then(async()=>{const current=await loadDatabase(),merged=mergeDatabase(current,hydrateDatabase(base),hydrateDatabase(next));await writeDatabase(merged);return merged;});
 writes=task.catch(()=>{});return task;
}

// Confirm the stored value before the settings dialog reports success.
export async function saveBlogAddress(input:string,persist:(update:(current:Database)=>Database)=>Promise<void>):Promise<string>{
 const normalized=normalizeBlog(input);
 if(!normalized)throw new Error('블로그 주소를 입력해 주세요.');
 await persist(current=>({...current,settings:{...current.settings,blogUrl:normalized}}));
 const stored=await loadDatabase();
 if(stored.settings.blogUrl!==normalized)throw new Error('저장된 주소를 확인하지 못했어요. 설정을 다시 열고 확인해 주세요.');
 return stored.settings.blogUrl;
}
