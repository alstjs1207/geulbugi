import type { Backup, Database, Preset, Settings } from './types';
import { normalizeBlog, safeColor, plainText, validatePost, upsertPosts } from './security';
import { defaultDatabase } from './defaults';
import {validateSchedulePreferences} from './schedule';
import {migrateDefaultColors,assertNaverFormat,isNaverQuoteStyle} from './naver-format-options';
const LIMIT=20*1024*1024;
export function validatePreset(value:unknown):Preset {
 if(!value||typeof value!=='object')throw new Error('프리셋 형식을 확인해 주세요.');
 const p=value as Preset,f=p.format??{};const format:Preset['format']={};
 if(f.fontSize!==undefined){if(!Number.isInteger(f.fontSize)||f.fontSize<10||f.fontSize>72)throw new Error('글자 크기가 올바르지 않아요.');format.fontSize=f.fontSize;}
 for(const key of ['color','background'] as const)if(f[key]!==undefined){if(!safeColor(f[key]))throw new Error('색상은 #RRGGBB 형식이어야 해요.');format[key]=f[key];}
 if(f.bold!==undefined){if(typeof f.bold!=='boolean')throw new Error('굵게 설정이 올바르지 않아요.');format.bold=f.bold;}
 if(f.align!==undefined){if(!['left','center','right'].includes(f.align))throw new Error('정렬 설정이 올바르지 않아요.');format.align=f.align;}
 if(f.paragraphStyle!==undefined){if(!['body','quote'].includes(f.paragraphStyle))throw new Error('문단 스타일을 확인해 주세요.');format.paragraphStyle=f.paragraphStyle;}
 if(f.quoteStyle!==undefined){if(!isNaverQuoteStyle(f.quoteStyle))throw new Error('인용구 모양을 확인해 주세요.');format.quoteStyle=f.quoteStyle;}
 const id=plainText(p.id,100),name=plainText(p.name,40).trim();if(!id||!name)throw new Error('프리셋 이름을 입력해 주세요.');
 return {id,name,description:plainText(p.description??'',100),format};
}
export function validateSettings(value:unknown):Settings {
 if(!value||typeof value!=='object')throw new Error('설정 자료를 확인해 주세요.');
 const s=value as Settings,r=s.rules;if(!r||!['selection','body'].includes(r.scope)||![1,2].includes(r.sentences)||!Number.isInteger(r.longLength)||r.longLength<10||r.longLength>120||![0,1,2].includes(r.blankLines)||typeof r.preserveExisting!=='boolean'||typeof r.reflow!=='boolean'||(r.reflow&&r.scope!=='selection')||(r.longMode!==undefined&&!['meaning','length'].includes(r.longMode)))throw new Error('줄바꿈 규칙을 확인해 주세요.');
 const shortcutPresets:Record<string,string>={};for(const [key,val] of Object.entries(s.shortcutPresets??{}))if(/^[1-8]$/.test(key)&&typeof val==='string')shortcutPresets[key]=plainText(val,100);
 return {blogUrl:normalizeBlog(s.blogUrl??''),rules:{scope:r.scope,sentences:r.sentences,longLength:r.longLength,longMode:r.longMode??'meaning',blankLines:r.blankLines,preserveExisting:r.preserveExisting,reflow:r.reflow},shortcutPresets,...(s.schedule!==undefined?{schedule:validateSchedulePreferences(s.schedule)}:{})};
}
export function exportBackup(db:Database,include:{presets:boolean;rules:boolean;posts:boolean}):Backup {return {format:'naver-blog-helper',version:1,exportedAt:new Date().toISOString(),...(include.presets?{presets:db.presets.map(validatePreset)}:{}),...(include.rules?{settings:validateSettings(db.settings)}:{}),...(include.posts?{posts:db.posts.map(p=>validatePost(p))}: {})};}
export function parseBackup(raw:string):Backup {
 if(new TextEncoder().encode(raw).byteLength>LIMIT)throw new Error('백업 파일은 20MB 이하로 선택해 주세요.');
 let b:Backup;try{b=JSON.parse(raw) as Backup;}catch{throw new Error('JSON 백업 파일을 선택해 주세요.');}
 if(b?.format!=='naver-blog-helper'||b.version!==1)throw new Error('지원하는 글부기 백업 형식이 아니에요.');
 if(b.presets&&!Array.isArray(b.presets)||b.posts&&!Array.isArray(b.posts))throw new Error('백업 자료 구조를 확인해 주세요.');
 // Presets created/merged by the product must round-trip through its own backup.
 // The byte limit above and per-item validation still bound imported data.
 if((b.posts?.length??0)>100000)throw new Error('가져오기 항목 수가 너무 많아요.');
 const presets=b.presets?.map(validatePreset);if(presets&&new Set(presets.map(p=>p.id)).size!==presets.length)throw new Error('중복 프리셋 ID가 있어요.');
 return {format:'naver-blog-helper',version:1,exportedAt:plainText(b.exportedAt??'',100),...(presets?{presets}:{}),...(b.settings?{settings:validateSettings(b.settings)}:{}),...(b.posts?{posts:b.posts.map(p=>validatePost(p))}:{})};
}
export function importBackup(db:Database,b:Backup,replaceSettings:boolean):Database {
 const settings=replaceSettings&&b.settings?validateSettings(b.settings):db.settings;
 const incoming=b.posts?.map(p=>validatePost(p,settings.blogUrl))??[];
 const incomingPresets=(b.presets??[]).filter(p=>replaceSettings||!db.presets.some(old=>old.id===p.id)).map(p=>{const preset=migrateDefaultColors(validatePreset(p));try{assertNaverFormat(preset.format);}catch(error){throw new Error('가져올 프리셋 “'+preset.name+'”: '+(error instanceof Error?error.message:String(error)));}return preset;});
 const presets=replaceSettings&&b.presets?incomingPresets:[...db.presets,...incomingPresets];
 return {schemaVersion:1,settings,presets,posts:upsertPosts(db.posts,incoming).posts};
}
export function hydrateDatabase(raw:unknown):Database {
 const defaults=defaultDatabase();if(!raw||typeof raw!=='object')return defaults;
 const db=raw as Database;if(db.schemaVersion!==1)throw new Error('지원하지 않는 저장 자료 버전이에요. 백업을 확인해 주세요.');
 return {...defaults,settings:validateSettings(db.settings),presets:db.presets.map(validatePreset).map(migrateDefaultColors),posts:db.posts.map(p=>validatePost(p))};
}
