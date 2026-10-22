import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {prepareEditorRecovery,reloadSavedEditor} from '../src/platform/editor-recovery';
import type {Snapshot} from '../src/core/types';
const editor:Snapshot={sessionId:'session',documentKey:'draft',revision:'saved',adapterSignature:'test',title:'복구 검수 글',url:'https://blog.naver.com/PostWriteForm.naver',editable:true,blocks:[],selection:null,linkedUrls:[],uploadBusy:false,canUndo:false};
let tab:chrome.tabs.Tab,stored:Record<string,unknown>,read:ReturnType<typeof vi.fn<(id:number)=>Promise<Snapshot|null>>>,reload:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 stored={};tab={id:10,windowId:7,active:true,url:'https://blog.naver.com/PostWriteForm.naver?blogId=sample'} as chrome.tabs.Tab;read=vi.fn(async()=>structuredClone(editor));reload=vi.fn(async()=>{});
 vi.stubGlobal('chrome',{tabs:{query:vi.fn(async()=>[tab]),get:vi.fn(async()=>tab),reload},storage:{session:{get:vi.fn(async(key:string)=>({[key]:stored[key]})),set:vi.fn(async(values:Record<string,unknown>)=>Object.assign(stored,values)),remove:vi.fn(async(key:string)=>{delete stored[key];})}}});
});
afterEach(()=>vi.unstubAllGlobals());
it('reloads only the saved active editor once, without sending an edit or publishing',async()=>{
 const target=await prepareEditorRecovery(7,editor,read);
 expect(reload).not.toHaveBeenCalled();await reloadSavedEditor(7,target,true,read);expect(reload).toHaveBeenCalledExactlyOnceWith(10);
 await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow('저장 확인');
 expect(reload).toHaveBeenCalledOnce();
});
it('requires an explicit saved confirmation',async()=>{
 const target=await prepareEditorRecovery(7,editor,read);await expect(reloadSavedEditor(7,target,false,read)).rejects.toThrow('임시저장');expect(reload).not.toHaveBeenCalled();
});
it.each([{sessionId:'other'},{documentKey:'other'},{revision:'unsaved'},{uploadBusy:true},{uploadPending:true},{mediaPreparing:true}])('rejects a changed or busy editor after save confirmation: %j',async change=>{
 const target=await prepareEditorRecovery(7,editor,read);read.mockResolvedValue({...editor,...change});await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow();expect(reload).not.toHaveBeenCalled();
});
it.each([{id:11},{url:'https://blog.naver.com/PostView.naver'},{pendingUrl:'https://example.test/'},{active:false}])('never reloads a switched or navigating tab: %j',async change=>{
 const target=await prepareEditorRecovery(7,editor,read);Object.assign(tab,change);await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow();expect(reload).not.toHaveBeenCalled();
});
it('binds confirmation to the current window and expires it after five minutes',async()=>{
 const target=await prepareEditorRecovery(7,editor,read);await expect(reloadSavedEditor(8,target,true,read)).rejects.toThrow();vi.spyOn(Date,'now').mockReturnValue(Date.now()+301_000);await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow('만료');expect(reload).not.toHaveBeenCalled();
});
it('refuses preparation when the panel snapshot is stale',async()=>{
 read.mockResolvedValue({...editor,revision:'new'});await expect(prepareEditorRecovery(7,editor,read)).rejects.toThrow('바뀌었어요');expect(reload).not.toHaveBeenCalled();
});
it('allows a disconnected writing URL while refusing a disconnected published post',async()=>{
 read.mockResolvedValue(null);const target=await prepareEditorRecovery(7,undefined,read);await reloadSavedEditor(7,target,true,read);expect(reload).toHaveBeenCalledOnce();
 tab.url='https://blog.naver.com/sample/123456';await expect(prepareEditorRecovery(7,undefined,read)).rejects.toThrow('글쓰기');
});
it('refuses a confirmation if a disconnected frame reconnects before reload',async()=>{
 read.mockResolvedValue(null);const target=await prepareEditorRecovery(7,undefined,read);read.mockResolvedValue(editor);await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow('상태가 바뀌');expect(reload).not.toHaveBeenCalled();
});
it('does not dispatch duplicate reloads when confirmation is clicked twice',async()=>{
 const target=await prepareEditorRecovery(7,editor,read);const first=reloadSavedEditor(7,target,true,read);await expect(reloadSavedEditor(7,target,true,read)).rejects.toThrow('다시 연결');await first;expect(reload).toHaveBeenCalledOnce();
});
