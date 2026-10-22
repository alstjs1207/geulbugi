import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {loadCardReferences,saveCardReference,type CardReference} from '../src/platform/link-card-cache';

const key='naver-blog-helper:link-cards:v1';
const reference:CardReference={componentId:'SE-11111111-2222-3333-4444-555555555555',url:'https://blog.naver.com/example_blog/10001',fingerprint:'abc123'};
let values:Map<string,string>;
beforeEach(()=>{
 values=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});vi.stubGlobal('chrome',undefined);
});
afterEach(()=>vi.unstubAllGlobals());

describe('native preview card URL references',()=>{
 it('stores only the native identity, canonical URL and visual fingerprint',async()=>{
  await saveCardReference({...reference,body:'discarded'} as CardReference);expect(await loadCardReferences()).toEqual([reference]);expect(Object.keys(JSON.parse(values.get(key)!)[0])).toEqual(['componentId','url','fingerprint']);
  values.set(key,JSON.stringify([{...reference,body:'also discarded'}]));expect(await loadCardReferences()).toEqual([reference]);
 });
 it('updates an existing component without losing unrelated card addresses',async()=>{
  const other={...reference,componentId:'SE-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};await saveCardReference(reference);await saveCardReference(other);await saveCardReference({...reference,fingerprint:'ff'});
  expect(await loadCardReferences()).toEqual([other,{...reference,fingerprint:'ff'}]);
 });
 it('rejects malformed entries and unsafe or noncanonical URLs',async()=>{
  values.set(key,JSON.stringify([reference,{...reference,url:'javascript:alert(1)'},{...reference,url:'https://m.blog.naver.com/example_blog/10001'},{...reference,componentId:'other'},{...reference,fingerprint:'body text'}]));expect(await loadCardReferences()).toEqual([reference]);
  await saveCardReference({...reference,url:'https://example.test/post'});expect(await loadCardReferences()).toEqual([reference]);
 });
 it('keeps the latest thousand references and tolerates damaged local data',async()=>{
  values.set(key,'broken');expect(await loadCardReferences()).toEqual([]);
  values.set(key,JSON.stringify(Array.from({length:1001},(_,i)=>({...reference,componentId:'SE-11111111-2222-3333-4444-'+i.toString().padStart(12,'0')}))));
  expect(await loadCardReferences()).toHaveLength(1000);expect((await loadCardReferences())[0].componentId.endsWith('000000000001')).toBe(true);
 });
 it('uses extension local storage without copying the body into its database',async()=>{
  const local:Record<string,unknown>={},get=vi.fn(async()=>local),set=vi.fn(async(update:Record<string,unknown>)=>Object.assign(local,update));vi.stubGlobal('chrome',{runtime:{id:'test-extension'},storage:{local:{get,set}}});
  await saveCardReference(reference);expect(set).toHaveBeenCalledWith({[key]:[reference]});expect(await loadCardReferences()).toEqual([reference]);expect(values.size).toBe(0);
 });
});
