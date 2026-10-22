import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {EditorRequest,EditorResponse,Snapshot} from '../src/core/types';
import {PUBLISH_TIME_RECONNECT} from '../src/core/editor-capabilities';

const editorSnapshot:Snapshot={sessionId:'test',documentKey:'draft',adapterSignature:'naver-one-public-ui-v26',title:'',url:'https://blog.naver.com/PostWriteForm.naver',revision:'body',editable:true,blocks:[],selection:null,linkedUrls:[],uploadBusy:false,canUndo:false};
const snapshot={ok:true,snapshot:editorSnapshot} as EditorResponse;
const preset={id:'quote',name:'인용구',description:'',format:{paragraphStyle:'quote',quoteStyle:'default'}} as const;
const format:EditorRequest={type:'format',preset};
const reservation:EditorRequest={type:'publish-time',value:{mode:'scheduled',date:'2026-10-12',time:'09:40'},expected:{sessionId:'test',documentKey:'draft',revision:'body'}};
const supported={ok:true,snapshot:{...editorSnapshot,adapterSignature:'naver-one-public-ui-v27',capabilities:['publish-time']}} as EditorResponse;

async function background(frames:{id:number;editable:boolean}[]){
 const values:Record<string,unknown>={};
 const onMessage=vi.fn(),query=vi.fn(async()=>[{id:10,url:'https://blog.naver.com/example_blog?Redirect=Write&'}]);
 const sendMessage=vi.fn(async(_tab:number,_message:{type:string;request:EditorRequest},_options?:{frameId:number})=>snapshot);
 vi.stubGlobal('chrome',{
  runtime:{id:'test-extension',onInstalled:{addListener:vi.fn()},onMessage:{addListener:onMessage}},
  tabs:{query,sendMessage,onRemoved:{addListener:vi.fn()}},
  storage:{session:{get:vi.fn(async(key:string)=>({[key]:key.startsWith('frames:')?frames:values[key]})),set:vi.fn(async(next:Record<string,unknown>)=>{Object.assign(values,next);}),remove:vi.fn(async(key:string)=>{delete values[key];})}},
  sidePanel:{setPanelBehavior:vi.fn(async()=>{})},commands:{onCommand:{addListener:vi.fn()}}
 });
 await import('../src/background');
 const listener=onMessage.mock.calls[0][0] as (message:unknown,sender:unknown,reply:(response:EditorResponse)=>void)=>void;
 const request=(request:EditorRequest,windowId?:number)=>new Promise<EditorResponse>(resolve=>listener({type:'EDITOR_REQUEST',request,windowId},{},resolve));
 return {query,sendMessage,request};
}

beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());

describe('routing after reopening an editor',()=>{
 it('blocks photo AI mutations to an older content script before dispatch',async()=>{
  const api=await background([{id:1,editable:true}]);
  const result=await api.request({type:'photo-ai-on',expected:{sessionId:'test',documentKey:'draft',revision:'body'}},77);
  expect(result).toMatchObject({ok:false,error:expect.stringContaining('새로고침')});
  expect(api.sendMessage.mock.calls.map(([,message])=>message.request.type)).toEqual(['snapshot']);
 });
 it('sends a photo AI mutation exactly once to a capable frame',async()=>{
  const api=await background([{id:1,editable:true}]);api.sendMessage.mockResolvedValue({ok:true,snapshot:{...editorSnapshot,capabilities:['photo-ai-on']}});
  expect((await api.request({type:'photo-ai-on',expected:{sessionId:'test',documentKey:'draft',revision:'body'}},77)).ok).toBe(true);
  expect(api.sendMessage.mock.calls.map(([,message])=>message.request.type)).toEqual(['snapshot','photo-ai-on']);
 });
 it('uses the panel window instead of the service worker current window',async()=>{
  const api=await background([{id:1,editable:true}]);
  expect((await api.request({type:'snapshot'},77)).ok).toBe(true);
  expect(api.query).toHaveBeenCalledWith({active:true,windowId:77});
 });
 it('keeps editor requests scoped to the current window when no panel window is provided',async()=>{
  const api=await background([{id:1,editable:true}]);
  await api.request({type:'snapshot'});
  expect(api.query).toHaveBeenCalledWith({active:true,currentWindow:true});
 });
 it('skips a disconnected frame using a snapshot probe and edits only the live frame',async()=>{
  const api=await background([{id:1,editable:true},{id:2,editable:true}]);
  api.sendMessage.mockImplementation(async(_tab,message,options)=>{
   if(options?.frameId===2)throw new Error('Receiving end does not exist.');
   return snapshot;
  });
  expect((await api.request(format,77)).ok).toBe(true);
  const edits=api.sendMessage.mock.calls.filter(([,message])=>message.request.type==='format');
  expect(edits).toHaveLength(1);expect(edits[0][2]).toEqual({frameId:1});
  expect(api.sendMessage.mock.calls[0][1].request.type).toBe('snapshot');
 });
 it('does not retry an edit after losing its response',async()=>{
  const api=await background([{id:1,editable:true},{id:2,editable:true}]);
  api.sendMessage.mockImplementation(async(_tab,message)=>{
   if(message.request.type==='format')throw new Error('Frame closed after dispatch.');
   return snapshot;
  });
  const result=await api.request(format,77);
  expect(result.ok).toBe(false);
  expect(api.sendMessage.mock.calls.filter(([,message])=>message.request.type==='format')).toHaveLength(1);
  expect(api.sendMessage.mock.calls).toHaveLength(2);
 });
 it('does not retry an editor rejection in another frame',async()=>{
  const api=await background([{id:1,editable:true},{id:2,editable:true}]);
  api.sendMessage.mockImplementation(async(_tab,message)=>message.request.type==='format'?{ok:false,error:'선택 영역이 달라졌어요.'}:snapshot);
  expect(await api.request(format,77)).toEqual({ok:false,error:'선택 영역이 달라졌어요.'});
  expect(api.sendMessage.mock.calls).toHaveLength(2);
 });
 it('never broadcasts an edit when frame registration is missing',async()=>{
  const api=await background([]);
  expect((await api.request(format,77)).ok).toBe(false);
  expect(api.sendMessage).not.toHaveBeenCalled();
 });
 it('never edits a frame that reports a read-only document',async()=>{
  const api=await background([{id:1,editable:true}]);
  api.sendMessage.mockResolvedValue({ok:true,snapshot:{editable:false}} as EditorResponse);
  expect((await api.request(format,77)).ok).toBe(false);
  expect(api.sendMessage.mock.calls.map(([,message])=>message.request.type)).toEqual(['snapshot']);
 });
});

describe('reservation routing across extension updates',()=>{
 it('rejects a legacy frame before sending any reservation mutation',async()=>{
  const api=await background([{id:1,editable:true}]);
  api.sendMessage.mockResolvedValue(snapshot);
  expect(await api.request(reservation,77)).toEqual({ok:false,error:PUBLISH_TIME_RECONNECT});
  expect(api.sendMessage.mock.calls.map(([,message])=>message.request.type)).toEqual(['snapshot']);
 });
 it('skips a legacy frame and sends the reservation once to a capable frame',async()=>{
  const api=await background([{id:1,editable:true},{id:2,editable:true}]);
  api.sendMessage.mockImplementation(async(_tab,_message,options)=>options?.frameId===2?snapshot:supported);
  expect((await api.request(reservation,77)).ok).toBe(true);
  const edits=api.sendMessage.mock.calls.filter(([,message])=>message.request.type==='publish-time');
  expect(edits).toHaveLength(1);expect(edits[0][2]).toEqual({frameId:1});
 });
 it('retains compatibility with 0.1.14 frames without explicit capabilities',async()=>{
  const api=await background([{id:1,editable:true}]);
  api.sendMessage.mockResolvedValue({ok:true,snapshot:{...editorSnapshot,adapterSignature:'naver-one-public-ui-v27'}});
  expect((await api.request(reservation,77)).ok).toBe(true);
  expect(api.sendMessage.mock.calls.map(([,message])=>message.request.type)).toEqual(['snapshot','publish-time']);
 });
 it('honors explicitly unavailable capabilities over the legacy signature',async()=>{
  const api=await background([{id:1,editable:true}]);
  api.sendMessage.mockResolvedValue({ok:true,snapshot:{...editorSnapshot,adapterSignature:'naver-one-public-ui-v27',capabilities:[]}});
  expect(await api.request(reservation,77)).toEqual({ok:false,error:PUBLISH_TIME_RECONNECT});
  expect(api.sendMessage).toHaveBeenCalledOnce();
 });
 it('does not repeat a reservation when its response is lost',async()=>{
  const api=await background([{id:1,editable:true},{id:2,editable:true}]);
  api.sendMessage.mockImplementation(async(_tab,message)=>{if(message.request.type==='publish-time')throw new Error('Frame closed after dispatch.');return supported;});
  expect((await api.request(reservation,77)).ok).toBe(false);
  expect(api.sendMessage.mock.calls.filter(([,message])=>message.request.type==='publish-time')).toHaveLength(1);
  expect(api.sendMessage.mock.calls).toHaveLength(2);
 });
});

it('includes the hosting window in editor requests from the panel bridge',async()=>{
 const sendMessage=vi.fn(async()=>snapshot);
 vi.stubGlobal('chrome',{runtime:{id:'test-extension',sendMessage},windows:{getCurrent:vi.fn(async()=>({id:77}))}});
 const {editorRequest}=await import('../src/platform/bridge');
 expect(await editorRequest({type:'snapshot'})).toEqual(snapshot);
 expect(sendMessage).toHaveBeenCalledWith({type:'EDITOR_REQUEST',request:{type:'snapshot'},windowId:77});
});

it('explains a legacy background rejection while preserving other editor errors',async()=>{
 const sendMessage=vi.fn(async()=>({ok:false,error:'지원하지 않는 편집 요청이에요.'}));
 vi.stubGlobal('chrome',{runtime:{id:'test-extension',sendMessage},windows:{getCurrent:vi.fn(async()=>({id:77}))}});
 const {editorRequest}=await import('../src/platform/bridge');
 expect(await editorRequest(reservation)).toEqual({ok:false,error:PUBLISH_TIME_RECONNECT});
 expect(await editorRequest(format)).toEqual({ok:false,error:'지원하지 않는 편집 요청이에요.'});
});

it('keeps a lost mutation blocked across panel snapshots until a fresh editor session connects',async()=>{
 const api=await background([{id:1,editable:true}]);let next:EditorResponse=snapshot;
 api.sendMessage.mockImplementation(async(_tab,message)=>{if(message.request.type==='format')throw new Error('Response lost after dispatch');return next;});
 expect(await api.request(format,77)).toMatchObject({ok:false,recoveryRequired:true});
 const read=await api.request({type:'snapshot'},77);expect(read).toMatchObject({ok:true,snapshot:{issue:expect.stringContaining('복구 안내'),canUndo:false}});
 expect(await api.request(format,77)).toMatchObject({ok:false,recoveryRequired:true});
 expect(api.sendMessage.mock.calls.filter(([,m])=>m.request.type==='format')).toHaveLength(1);
 next={ok:true,snapshot:{...editorSnapshot,sessionId:'fresh-session'}};expect(await api.request({type:'snapshot'},77)).toMatchObject({ok:true,snapshot:{sessionId:'fresh-session'}});
 expect((await api.request({type:'snapshot'},77) as {snapshot:Snapshot}).snapshot.issue).toBeUndefined();
});
