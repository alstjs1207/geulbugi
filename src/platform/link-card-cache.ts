import {isExtension} from './storage';
import {canonicalPost} from '../core/security';
export type CardReference={componentId:string;url:string;fingerprint:string};
const KEY='naver-blog-helper:link-cards:v1';
function fields(entry:CardReference):CardReference{return {componentId:entry.componentId,url:entry.url,fingerprint:entry.fingerprint};}
function valid(value:unknown):value is CardReference{
 if(!value||typeof value!=='object')return false;
 const entry=value as CardReference;
 if(typeof entry.componentId!=='string'||!/^SE-[a-z0-9-]{10,100}$/i.test(entry.componentId)||typeof entry.fingerprint!=='string'||!/^[a-f0-9]{1,8}$/.test(entry.fingerprint))return false;
 try{return canonicalPost(entry.url).url===entry.url;}catch{return false;}
}
export async function loadCardReferences():Promise<CardReference[]>{
 try{const raw=isExtension()?(await chrome.storage.local.get(KEY))[KEY]:JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(raw)?raw.filter(valid).slice(-1000).map(fields):[];}catch{return [];}
}
export async function saveCardReference(reference:CardReference):Promise<void>{
 if(!valid(reference))return;
 const current=await loadCardReferences(),entries=[...current.filter(item=>item.componentId!==reference.componentId),fields(reference)].slice(-1000);
 if(isExtension())await chrome.storage.local.set({[KEY]:entries});else localStorage.setItem(KEY,JSON.stringify(entries));
}
