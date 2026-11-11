// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {App} from '../src/ui/App';
import {defaultDatabase} from '../src/core/defaults';
import {DemoEditor} from '../src/platform/demo';
import type {Database} from '../src/core/types';
let stored:Database,writes:{next:Database;resolve:()=>void;reject:(e:Error)=>void}[];
vi.mock('../src/platform/bridge',async original=>({...await original<typeof import('../src/platform/bridge')>(),editorRequest:vi.fn(async()=>({ok:true,snapshot:new DemoEditor().snapshot()}))}));
vi.mock('../src/platform/storage',async original=>({...await original<typeof import('../src/platform/storage')>(),isExtension:()=>true,loadDatabase:vi.fn(async()=>structuredClone(stored)),saveDatabase:vi.fn((next:Database)=>new Promise<void>((resolve,reject)=>writes.push({next,resolve:()=>{stored=structuredClone(next);resolve();},reject})))}));
let host:HTMLDivElement,root:Root;
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!;
const box=()=>host.querySelector<HTMLInputElement>('.rules-form input[type=checkbox]')!;
beforeEach(async()=>{
 stored=defaultDatabase();writes=[];vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('chrome',{runtime:{id:'test',getURL:(p:string)=>p,onMessage:{addListener:vi.fn(),removeListener:vi.fn()}},windows:{getCurrent:vi.fn(async()=>({id:77}))},storage:{onChanged:{addListener:vi.fn(),removeListener:vi.fn()}}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));await act(async()=>button('줄바꿈').click());
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});

it('shows off and on immediately and ignores the first delayed acknowledgement',async()=>{
 await act(async()=>box().click());expect(box().checked).toBe(false);expect(writes).toHaveLength(1);
 await act(async()=>box().click());expect(box().checked).toBe(true);
 await act(async()=>writes[0].resolve());expect(box().checked).toBe(true);expect(writes).toHaveLength(2);
 await act(async()=>writes[1].resolve());expect(stored.settings.rules.preserveExisting).toBe(true);expect(box().checked).toBe(true);
});

it('restores the persisted checkbox and reports a failed last write',async()=>{
 await act(async()=>box().click());expect(box().checked).toBe(false);
 await act(async()=>writes[0].reject(new Error('저장 실패 검수')));
 expect(box().checked).toBe(true);expect(stored.settings.rules.preserveExisting).toBe(true);expect(host.querySelector('[role=alert]')?.textContent).toContain('저장 실패 검수');
});

it('keeps multiple field intents while writes are serialized',async()=>{
 await act(async()=>box().click());await act(async()=>button('2문장').click());
 expect(box().checked).toBe(false);expect(button('2문장').className).toBe('active');
 await act(async()=>writes[0].resolve());expect(box().checked).toBe(false);expect(button('2문장').className).toBe('active');
 await act(async()=>writes[1].resolve());expect(stored.settings.rules).toMatchObject({preserveExisting:false,sentences:2});
});

it('does not carry a failed earlier field into a later successful save',async()=>{
 await act(async()=>box().click());await act(async()=>button('2문장').click());
 await act(async()=>writes[0].reject(new Error('첫 저장 실패')));await act(async()=>writes[1].resolve());
 expect(stored.settings.rules).toMatchObject({preserveExisting:true,sentences:2});expect(box().checked).toBe(true);expect(button('2문장').className).toBe('active');
});
