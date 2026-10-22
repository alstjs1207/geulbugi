// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlogSettings } from '../src/ui/BlogSettings';
import { Modal } from '../src/ui/components';
import { loadDatabase, saveBlogAddress, saveDatabase } from '../src/platform/storage';
import type { Database } from '../src/core/types';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.stubGlobal('chrome', undefined);
 const records=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>records.set(key,value),clear:()=>records.clear()});
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function persist(update:(current:Database)=>Database) { const base=await loadDatabase(); await saveDatabase(update(structuredClone(base)),base); }
async function typeUrl(value:string) {
 const input=host.querySelector('input')!;
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
async function submit() { await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); }

describe('blog address save feedback inside the settings dialog',()=>{
 it('confirms persistence and keeps the saved address visible after settings are reopened',async()=>{
  const save=async(input:string)=>saveBlogAddress(input,persist);
  const render=(savedUrl:string)=>root.render(<Modal title="설정" onClose={()=>{}}><BlogSettings savedUrl={savedUrl} postCount={0} connected={false} onSave={save}/></Modal>);
  await act(async()=>render(''));
  await typeUrl('https://m.blog.naver.com/msyu1207?tracking=x'); await submit();
  const stored=await loadDatabase(); expect(stored.settings.blogUrl).toBe('https://blog.naver.com/msyu1207');
  expect(host.querySelector('[role="dialog"] [role="status"]')?.textContent).toContain('블로그 주소를 저장했어요.');
  await act(async()=>root.render(null)); await act(async()=>render(stored.settings.blogUrl));
  expect(host.querySelector('.saved-blog-address')?.textContent).toContain(stored.settings.blogUrl);
  expect(host.textContent).toContain('주소 저장과 별도로 편집기 연결 확인');
 });
 it('shows a storage failure in the dialog and leaves the previously saved value intact',async()=>{
  await saveBlogAddress('https://blog.naver.com/original_blog',persist);
  vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('저장 공간이 부족해요.');});
  await act(async()=>root.render(<Modal title="설정" onClose={()=>{}}><BlogSettings savedUrl="https://blog.naver.com/original_blog" postCount={0} connected={false} onSave={input=>saveBlogAddress(input,persist)}/></Modal>));
  await typeUrl('https://blog.naver.com/msyu1207'); await submit();
  expect(host.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('저장 공간이 부족해요.');
  expect((await loadDatabase()).settings.blogUrl).toBe('https://blog.naver.com/original_blog');
  expect(host.querySelector('input')?.value).toBe('https://blog.naver.com/msyu1207');
 });
 it('never reports success if the write response did not persist the requested value',async()=>{
  await act(async()=>root.render(<BlogSettings savedUrl="" postCount={0} connected={false} onSave={input=>saveBlogAddress(input,async()=>{})}/>));
  await typeUrl('https://blog.naver.com/msyu1207'); await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('저장된 주소를 확인하지 못했어요.');
  expect(host.querySelector('[role="status"]')).toBeNull();
 });
 it('shows the pending state and does not send duplicate writes while one save is in progress',async()=>{
  let finish!:(value:string)=>void;
  const save=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<BlogSettings savedUrl="https://blog.naver.com/msyu1207" postCount={0} connected={false} onSave={save}/>));
  await submit(); await submit();
  expect(save).toHaveBeenCalledTimes(1); expect(host.querySelector('button')?.disabled).toBe(true); expect(host.textContent).toContain('저장 중');
  await act(async()=>finish('https://blog.naver.com/msyu1207'));
  expect(host.querySelector('button')?.disabled).toBe(false); expect(host.querySelector('[role="status"]')?.textContent).toContain('저장했어요');
 });
});
