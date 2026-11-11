// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {App} from '../src/ui/App';
import {DemoEditor} from '../src/platform/demo';
import {defaultDatabase} from '../src/core/defaults';
import type {EditorResponse} from '../src/core/types';
import {editorRequest} from '../src/platform/bridge';

vi.mock('../src/platform/bridge',async original=>({...await original<typeof import('../src/platform/bridge')>(),editorRequest:vi.fn()}));
vi.mock('../src/platform/storage',async original=>({...await original<typeof import('../src/platform/storage')>(),loadDatabase:vi.fn(async()=>defaultDatabase()),isExtension:()=>true}));
let host:HTMLDivElement,root:Root,listener:(message:unknown)=>void;
const ready=()=>({ok:true,snapshot:new DemoEditor().snapshot()} as const);
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
const deferred=()=>{let resolve!:(response:EditorResponse)=>void;const promise=new Promise<EditorResponse>(done=>{resolve=done;});return {promise,resolve};};
async function emit(message:unknown){await act(async()=>listener(message));}
async function poll(){await emit({type:'PANEL_REFRESH'});await act(async()=>vi.advanceTimersByTimeAsync(500));}

beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('chrome',{runtime:{id:'test',getURL:(path:string)=>path,onMessage:{addListener:(fn:typeof listener)=>{listener=fn;},removeListener:vi.fn()}},windows:{getCurrent:vi.fn(async()=>({id:77}))},storage:{onChanged:{addListener:vi.fn(),removeListener:vi.fn()}}});
 vi.mocked(editorRequest).mockResolvedValue(ready());
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

it('keeps a confirmed shortcut result when an older snapshot later fails',async()=>{
 await act(async()=>root.render(<App/>));
 const pending=deferred();vi.mocked(editorRequest).mockReturnValueOnce(pending.promise);await poll();
 const applied=ready();applied.snapshot.canUndo=true;
 await emit({type:'SHORTCUT_RESULT',response:applied});
 await act(async()=>pending.resolve({ok:false,error:'이전 연결 응답 실패'}));
 expect(host.querySelector('.recovery-banner')).toBeNull();
 expect(button('되돌리기').disabled).toBe(false);
 expect(editorRequest).toHaveBeenCalledTimes(2);
});

it('ignores a stale failed poll after a newer connection check succeeds',async()=>{
 await act(async()=>root.render(<App/>));
 const older=deferred(),newer=deferred();vi.mocked(editorRequest).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
 await poll();
 await act(async()=>button('사진').click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="사진 목록 새로고침"]')!.click());
 await act(async()=>newer.resolve(ready()));
 await act(async()=>older.resolve({ok:false,error:'지연된 연결 오류'}));
 expect(host.querySelector('.recovery-banner')).toBeNull();
});

it('still shows a connection error when a poll made after the shortcut fails',async()=>{
 await act(async()=>root.render(<App/>));
 await emit({type:'SHORTCUT_RESULT',response:ready()});
 vi.mocked(editorRequest).mockResolvedValueOnce({ok:false,error:'현재 연결 오류'});
 await poll();
 expect(host.querySelector('.recovery-banner')?.textContent).toContain('연결 다시 확인');
 expect(button('선택 영역에 적용').disabled).toBe(true);
});

it('only applies shortcut results from the panel window',async()=>{
 await act(async()=>root.render(<App/>));
 const applied=ready();applied.snapshot.canUndo=true;
 await emit({type:'SHORTCUT_RESULT',response:applied,windowId:88});
 expect(button('되돌리기').disabled).toBe(true);expect(host.querySelector('.event-notice')).toBeNull();
 await emit({type:'SHORTCUT_RESULT',response:applied,windowId:77});
 expect(button('되돌리기').disabled).toBe(false);expect(host.querySelector('.event-notice')?.textContent).toContain('단축키로');
});

it('does not let a poll started before a panel edit overwrite its confirmed result',async()=>{
 await act(async()=>root.render(<App/>));
 const pending=deferred();vi.mocked(editorRequest).mockReturnValueOnce(pending.promise);await poll();
 const applied=ready();applied.snapshot.canUndo=true;vi.mocked(editorRequest).mockResolvedValueOnce(applied);
 await act(async()=>button('선택 영역에 적용').click());
 await act(async()=>pending.resolve({ok:false,error:'편집 전 연결 오류'}));
 expect(host.querySelector('.recovery-banner')).toBeNull();expect(button('되돌리기').disabled).toBe(false);
});

it('keeps an uncertain shortcut blocked through a healthy probe of the same session',async()=>{
 const current=ready();vi.mocked(editorRequest).mockResolvedValue(current);
 await act(async()=>root.render(<App/>));
 await emit({type:'SHORTCUT_RESULT',response:{ok:false,error:'단축키 작업 응답 유실',recoveryRequired:true}});
 expect(host.querySelector('.recovery-banner')?.textContent).toContain('본문 확인');
 expect(button('선택 영역에 적용').disabled).toBe(true);
 vi.mocked(editorRequest).mockResolvedValue({ok:true,snapshot:{...current.snapshot,sessionId:'fresh-session'}});
 await act(async()=>button('연결 다시 확인').click());
 expect(host.querySelector('.recovery-banner')).toBeNull();expect(button('선택 영역에 적용').disabled).toBe(false);
});
