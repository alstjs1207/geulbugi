// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {RulesEditor} from '../src/ui/RulesEditor';
import {defaultDatabase} from '../src/core/defaults';
import type {BreakRules} from '../src/core/types';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(name:string)=>[...host.querySelectorAll('button')].find(button=>button.textContent===name)!;
async function set(selector:string,value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!,prototype=input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}

describe('linebreak rule intents during delayed persistence',()=>{
 it('defaults to clause-first wrapping and sends only the chosen mode when switched',async()=>{
  const rules=defaultDatabase().settings.rules,change=vi.fn();
  await act(async()=>root.render(<RulesEditor rules={rules} onChange={change}/>));
  expect(host.querySelector<HTMLSelectElement>('#long-mode')!.value).toBe('meaning');expect(host.textContent).toContain('안전한 경계가 없으면 문장을 유지');
  await set('#long-mode','length');expect(change).toHaveBeenCalledExactlyOnceWith({longMode:'length'});
 });
 it('keeps every field when several controls change before persisted props return',async()=>{
  const initial=defaultDatabase().settings.rules,pending:Partial<BreakRules>[]=[];let stored=structuredClone(initial);
  await act(async()=>root.render(<RulesEditor rules={initial} onChange={patch=>pending.push(patch)}/>));
  await act(async()=>button('일반 본문').click());await act(async()=>button('2문장').click());await set('#long-length','24');await set('#blank-lines','0');
  for(const patch of pending)stored={...stored,...patch};
  expect(stored).toMatchObject({scope:'body',sentences:2,longLength:24,blankLines:0,preserveExisting:true,reflow:false});
  await act(async()=>root.render(<RulesEditor rules={stored} onChange={()=>{}}/>));expect(button('일반 본문').className).toBe('active');expect((host.querySelector('#long-length') as HTMLInputElement).value).toBe('24');
 });
 it('does not cancel a pending reflow choice when preservation is switched off using stale props',async()=>{
  const rules={...defaultDatabase().settings.rules,scope:'selection' as const},pending:Partial<BreakRules>[]=[];
  await act(async()=>root.render(<RulesEditor rules={rules} onChange={patch=>pending.push(patch)}/>));
  const boxes=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');await act(async()=>boxes[1].click());await act(async()=>boxes[0].click());
  expect(pending.reduce((current,patch)=>({...current,...patch}),rules)).toMatchObject({reflow:true,preserveExisting:false});
 });
 it('blocks an unsupported native join choice but permits clearing an imported legacy choice',async()=>{
  const rules={...defaultDatabase().settings.rules,scope:'selection' as const},change=vi.fn();
  await act(async()=>root.render(<RulesEditor rules={rules} canReflow={false} onChange={change}/>));expect(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].disabled).toBe(true);expect(host.textContent).toContain('줄 합치기는 지원하지');
  await act(async()=>root.render(<RulesEditor rules={{...rules,reflow:true,preserveExisting:false}} canReflow={false} onChange={change}/>));const legacy=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];expect(legacy.disabled).toBe(false);await act(async()=>legacy.click());expect(change).toHaveBeenCalledWith({reflow:false,preserveExisting:true});
 });
});
