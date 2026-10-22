// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {DemoEditor} from '../src/platform/demo';
import {EditorRecoveryDialog} from '../src/ui/EditorRecovery';
import {App} from '../src/ui/App';
import {editorRequest,prepareRecovery,reloadAfterSave} from '../src/platform/bridge';
vi.mock('../src/platform/bridge',async original=>({...await original<typeof import('../src/platform/bridge')>(),editorRequest:vi.fn(),prepareRecovery:vi.fn(),reloadAfterSave:vi.fn()}));
let host:HTMLDivElement,root:Root;
const snapshot=()=>new DemoEditor().snapshot();
const target={token:'confirmed',windowId:7,title:'검수 글'};
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(editorRequest).mockResolvedValue({ok:true,snapshot:snapshot()});vi.mocked(prepareRecovery).mockResolvedValue(target);vi.mocked(reloadAfterSave).mockResolvedValue();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
const checkbox=()=>host.querySelector<HTMLInputElement>('[type=checkbox]')!;
async function click(text:string){await act(async()=>button(text).click());}
it('keeps reload disabled until the user acknowledges native saving and preparation succeeds',async()=>{
 const onReload=vi.fn(),onCheck=vi.fn(async()=>{});await act(async()=>root.render(<EditorRecoveryDialog snapshot={snapshot()} onClose={()=>{}} onReload={onReload} onCheck={onCheck}/>));
 expect(button('저장한 글 새로고침').disabled).toBe(true);expect(prepareRecovery).not.toHaveBeenCalled();
 await act(async()=>checkbox().click());expect(prepareRecovery).toHaveBeenCalledOnce();expect(button('저장한 글 새로고침').disabled).toBe(false);
 await click('저장한 글 새로고침');expect(reloadAfterSave).toHaveBeenCalledExactlyOnceWith(target);expect(onReload).toHaveBeenCalledOnce();
});
it('invalidates confirmation when the document changes and never reloads from a stale checked box',async()=>{
 const props={onClose:vi.fn(),onReload:vi.fn(),onCheck:vi.fn(async()=>{})},s=snapshot();await act(async()=>root.render(<EditorRecoveryDialog {...props} snapshot={s}/>));await act(async()=>checkbox().click());
 await act(async()=>root.render(<EditorRecoveryDialog {...props} snapshot={{...s,revision:'new-input'}}/>));expect(checkbox().checked).toBe(false);expect(button('저장한 글 새로고침').disabled).toBe(true);expect(reloadAfterSave).not.toHaveBeenCalled();
});
it('shows a failed preparation persistently and leaves the reload button disabled',async()=>{
 vi.mocked(prepareRecovery).mockRejectedValueOnce(new Error('사진 업로드가 진행 중이에요.'));await act(async()=>root.render(<EditorRecoveryDialog snapshot={snapshot()} onClose={()=>{}} onReload={()=>{}} onCheck={async()=>{}}/>));await act(async()=>checkbox().click());expect(host.querySelector('[role=alert]')?.textContent).toContain('업로드');expect(button('저장한 글 새로고침').disabled).toBe(true);expect(reloadAfterSave).not.toHaveBeenCalled();
});
it('refreshes failures immediately and keeps an uncertain result blocked through a healthy same-session probe',async()=>{
 const s=snapshot();vi.mocked(editorRequest).mockImplementation(async request=>request.type==='snapshot'?{ok:true,snapshot:s}:{ok:false,error:'응답이 끊겼어요.',recoveryRequired:true});
 await act(async()=>root.render(<App/>));await click('선택 영역에 적용');expect(host.querySelector('.recovery-banner')?.textContent).toContain('본문 확인');expect(button('선택 영역에 적용').disabled).toBe(true);
 expect(vi.mocked(editorRequest).mock.calls.map(([request])=>request.type)).toEqual(['snapshot','format','snapshot']);
 await click('연결 다시 확인');expect(button('선택 영역에 적용').disabled).toBe(true);
 vi.mocked(editorRequest).mockResolvedValue({ok:true,snapshot:{...s,sessionId:'reloaded'}});await click('연결 다시 확인');expect(host.querySelector('.recovery-banner')).toBeNull();expect(button('선택 영역에 적용').disabled).toBe(false);
});
it('keeps a recoverable rejection editable instead of demanding a page reload',async()=>{
 const s=snapshot();vi.mocked(editorRequest).mockImplementation(async request=>request.type==='snapshot'?{ok:true,snapshot:s}:{ok:false,error:'글자를 다시 선택해 주세요.'});await act(async()=>root.render(<App/>));await click('선택 영역에 적용');expect(host.querySelector('.recovery-banner')).toBeNull();expect(button('선택 영역에 적용').disabled).toBe(false);
});
