// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PhotoUploadButton} from '../src/ui/PhotoUploadButton';
import {encodePhotoFiles} from '../src/core/photo-upload';
vi.mock('../src/core/photo-upload',()=>({encodePhotoFiles:vi.fn(),PHOTO_UPLOAD_ACCEPT:'.jpg,.jpeg,.gif,.png,.bmp,.heic,.heif,.webp'}));
const encoded=[{name:'사진.png',type:'image/png',size:3,data:'AQID'}];
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(encodePhotoFiles).mockReset().mockResolvedValue(encoded);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const props=()=>({disabled:false,onUpload:vi.fn().mockResolvedValue(true),onError:vi.fn(),onCancel:vi.fn()});
const input=()=>host.querySelector<HTMLInputElement>('input[type=file]')!;
const button=()=>host.querySelector<HTMLButtonElement>('button')!;
async function choose(){await act(async()=>button().click());}
async function select(){await act(async()=>{Object.defineProperty(input(),'files',{configurable:true,value:[new File(['abc'],'사진.png')]});input().dispatchEvent(new Event('change',{bubbles:true}));});}
describe('photo picker user activation and cancellation',()=>{
 it('opens the picker synchronously inside the click and sends no edit until files are selected',async()=>{
  const p=props();await act(async()=>root.render(<PhotoUploadButton {...p}/>));let clicking=false;
  const open=vi.spyOn(input(),'click').mockImplementation(()=>expect(clicking).toBe(true));
  await act(async()=>{clicking=true;button().click();clicking=false;});
  expect(open).toHaveBeenCalledOnce();expect(p.onUpload).not.toHaveBeenCalled();expect(button().disabled).toBe(true);expect(input().multiple).toBe(true);expect(input().accept).toContain('.heic');
  await select();expect(p.onUpload).toHaveBeenCalledExactlyOnceWith(encoded);expect(button().disabled).toBe(false);
 });
 it('retains the insertion callback from the click while snapshots refresh',async()=>{
  const old=props(),next=props();await act(async()=>root.render(<PhotoUploadButton {...old}/>));vi.spyOn(input(),'click').mockImplementation(()=>{});await choose();
  await act(async()=>root.render(<PhotoUploadButton {...next}/>));await select();
  expect(old.onUpload).toHaveBeenCalledExactlyOnceWith(encoded);expect(next.onUpload).not.toHaveBeenCalled();
 });
 it('cancels without an editor request and allows selecting the same file again',async()=>{
  const p=props();await act(async()=>root.render(<PhotoUploadButton {...p}/>));vi.spyOn(input(),'click').mockImplementation(()=>{});await choose();
  await act(async()=>input().dispatchEvent(new Event('cancel',{bubbles:true})));expect(p.onCancel).toHaveBeenCalledOnce();expect(p.onUpload).not.toHaveBeenCalled();expect(button().disabled).toBe(false);
  await choose();await select();await choose();await select();expect(p.onUpload).toHaveBeenCalledTimes(2);
 });
 it('allows cancelling an abandoned chooser without sending or accepting late files',async()=>{
  const p=props();await act(async()=>root.render(<PhotoUploadButton {...p}/>));vi.spyOn(input(),'click').mockImplementation(()=>{});await choose();
  const cancel=[...host.querySelectorAll('button')].find(button=>button.textContent==='사진 선택 취소')!;await act(async()=>cancel.click());await select();
  expect(p.onCancel).toHaveBeenCalledOnce();expect(p.onUpload).not.toHaveBeenCalled();expect(button().disabled).toBe(false);expect(host.textContent).not.toContain('사진 선택 취소');
 });
 it('reports picker and file-reading errors without locking the button',async()=>{
  const p=props();await act(async()=>root.render(<PhotoUploadButton {...p}/>));const open=vi.spyOn(input(),'click').mockImplementation(()=>{throw new DOMException('No activation','NotAllowedError');});await choose();
  expect(p.onError).toHaveBeenCalledWith(expect.stringContaining('선택'));expect(button().disabled).toBe(false);expect(p.onUpload).not.toHaveBeenCalled();
  open.mockImplementation(()=>{});vi.mocked(encodePhotoFiles).mockRejectedValueOnce(new Error('20MB 이하로 선택해 주세요.'));await choose();await select();
  expect(p.onError).toHaveBeenCalledWith('20MB 이하로 선택해 주세요.');expect(button().disabled).toBe(false);expect(p.onUpload).not.toHaveBeenCalled();
 });
 it('submits one selection once and stays disabled until transfer finishes',async()=>{
  let finish!:()=>void;const p=props();p.onUpload.mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve(true);}));
  await act(async()=>root.render(<PhotoUploadButton {...p}/>));const open=vi.spyOn(input(),'click').mockImplementation(()=>{});await choose();await choose();await select();await select();
  expect(open).toHaveBeenCalledOnce();expect(p.onUpload).toHaveBeenCalledOnce();expect(button().disabled).toBe(true);
  await act(async()=>finish());expect(button().disabled).toBe(false);
 });
});
