// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {EditorReader} from '../src/editor/reader';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';
import type {EditorRequest,Snapshot} from '../src/core/types';
let readers:EditorReader[]=[];
beforeEach(async()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 document.body.innerHTML='<div class="se-documentTitle"><p class="se-text-paragraph">사진 검증</p></div><div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span style="font-weight:700">앞 문장</span></p><p class="se-text-paragraph"></p><p class="se-text-paragraph"><span>뒤 문장</span></p></div><div id="existing-photo" class="se-component se-image"><img class="se-image-resource" src="https://example.test/existing.png" alt="기존 사진"><div class="se-module-image-caption"><p class="se-text-paragraph"><span>기존 캡션</span></p></div></div></div></div>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:20,left:0,top:0,right:100,bottom:20} as DOMRect);
 vi.stubGlobal('DataTransfer',class{files:File[]=[];items={add:(file:File)=>this.files.push(file)};});
 await saveDatabase(defaultDatabase());
});
afterEach(()=>{readers.forEach(reader=>reader.dispose());readers=[];vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();document.body.innerHTML='';});
const root=()=>document.querySelector<HTMLElement>('.se-main-container')!;
function nativeUpload(onFiles:(files:File[])=>void=()=>{},onLayout?:()=>void){
 const control=document.createElement('button');control.textContent='사진사진 추가';document.body.append(control);
 const changed=vi.fn();control.addEventListener('click',()=>{
  const input=document.createElement('input');input.id='hidden-file';input.type='file';input.multiple=true;input.accept='.jpg,.jpeg,.gif,.png,.bmp,.heic,.heif,.webp';
  let files:File[]=[];Object.defineProperty(input,'files',{get:()=>files,set:value=>{files=value;}});
  input.addEventListener('change',()=>{changed(files);input.remove();if(files.length===1){onFiles(files);return;}
   const popup=document.createElement('div');popup.className='se-popup se-popup-image-type';popup.innerHTML='<input type="button" id="image-type-list"><label for="image-type-list">개별사진</label><button class="se-popup-close-button">팝업 닫기</button>';
   popup.querySelector('input')!.addEventListener('click',()=>{onFiles(files);popup.remove();});popup.querySelector('button')!.addEventListener('click',()=>popup.remove());document.body.append(popup);onLayout?.();
  });document.body.append(input);
 });return {control,changed};
}
function instance(){const adapter=new NativeAdapter();readers.push(adapter.reader);vi.spyOn(adapter.reader,'selectAt').mockResolvedValue();return adapter;}
function request(before:Snapshot,index=0,placement:'before'|'after'='after',count=1):Extract<EditorRequest,{type:'photo-add'}>{return {type:'photo-add',targetId:before.blocks[index].id,placement,expected:{sessionId:before.sessionId,documentKey:before.documentKey,revision:before.revision},files:Array.from({length:count},(_,index)=>({name:'사진'+index+'.png',type:'image/png',size:3,data:'AQID'}))};}
function photo(name='사진0.png',ready=false){const component=document.createElement('div');component.id='new-'+name;component.className='se-component se-image';component.innerHTML='<img class="se-image-resource">';const image=component.querySelector('img')!;image.alt=name;image.src=ready?'https://example.test/'+name:'data:image/svg+xml;base64,AA==';return component;}
describe('public photo upload input',()=>{
 it('uses a newly created native file input and changes it once in file order',async()=>{
  const reader=new EditorReader();readers.push(reader);const {changed}=nativeUpload(),edited=vi.fn(),files=[new File(['abc'],'a.png',{type:'image/png'}),new File(['def'],'b.png',{type:'image/png'})];
  await new PublicEditorUI(reader,edited).uploadPhotos(files);expect(changed).toHaveBeenCalledExactlyOnceWith(files);expect(edited).toHaveBeenCalledOnce();expect(root().textContent).toContain('앞 문장');
  expect(document.querySelector('.se-popup-image-type')).toBeNull();
 });
 it('refuses to send files to an unrelated existing input if native upload does not open',async()=>{
  vi.useFakeTimers();document.body.insertAdjacentHTML('beforeend','<button>사진 추가</button><input id="hidden-file" type="file" multiple accept=".jpg,.png">');const old=document.querySelector('input')!,changed=vi.fn();old.addEventListener('change',changed);
  const reader=new EditorReader();readers.push(reader);const edited=vi.fn(),pending=new PublicEditorUI(reader,edited).uploadPhotos([new File(['abc'],'a.png')]),check=expect(pending).rejects.toThrow('업로드 입력');
  await vi.advanceTimersByTimeAsync(2100);await check;expect(changed).not.toHaveBeenCalled();expect(edited).not.toHaveBeenCalled();expect(document.querySelector('input')).toBe(old);
 });
 it('preserves an existing popup and does not dispatch any files',async()=>{
  document.body.insertAdjacentHTML('beforeend','<div class="se-popup">사용자가 연 창</div>');const {changed,control}=nativeUpload(),click=vi.fn();control.addEventListener('click',click);const reader=new EditorReader();readers.push(reader);
  await expect(new PublicEditorUI(reader,vi.fn()).uploadPhotos([new File(['abc'],'a.png')])).rejects.toThrow('창을 닫은');expect(click).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
 });
 it('closes its layout chooser without importing when the body changes before layout selection',async()=>{
  const filesAdded=vi.fn();nativeUpload(filesAdded,()=>{document.querySelector('p span')!.textContent='사용자 새 글';});const reader=new EditorReader();readers.push(reader);const edited=vi.fn();
  await expect(new PublicEditorUI(reader,edited).uploadPhotos([new File(['abc'],'a.png'),new File(['abc'],'b.png')])).rejects.toThrow('본문이 바뀌');expect(filesAdded).not.toHaveBeenCalled();expect(document.querySelector('.se-popup-image-type')).toBeNull();expect(document.querySelector('p span')!.textContent).toBe('사용자 새 글');
 });
});
describe('photo upload journal and preservation',()=>{
 it.each(['before','after'] as const)('waits for real image URLs, preserves text and captions, and undoes insertion %s a paragraph',async placement=>{
  const adapter=instance(),before=await adapter.snapshot(),html=root().innerHTML,target=document.querySelector('p span')!.parentElement!,added=photo();nativeUpload(()=>target.insertAdjacentElement(placement==='before'?'beforebegin':'afterend',added));
  const result=await adapter.handle(request(before,0,placement));expect(result).toMatchObject({ok:true,snapshot:{uploadPending:true,uploadBusy:true,canUndo:false}});
  expect((await adapter.handle({type:'format',preset:{id:'x',name:'x',description:'',format:{bold:true}}})).ok).toBe(false);
  expect((await adapter.handle({type:'photo-add-cancel'})).ok).toBe(false);expect((await adapter.snapshot()).uploadPending).toBe(true);
  added.querySelector('img')!.src='https://example.test/사진0.png';const after=await adapter.snapshot();expect(after).toMatchObject({uploadPending:false,uploadBusy:false,canUndo:true});expect(after.issue).toBeUndefined();expect(after.blocks.find(b=>b.componentId==='existing-photo')?.photo?.caption).toBe('기존 캡션');
  const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root().innerHTML=html;return true;});expect((await adapter.handle({type:'undo'})).ok).toBe(true);expect((await adapter.snapshot()).revision).toBe(before.revision);expect(undo).toHaveBeenCalledOnce();
 });
 it('accepts an empty paragraph even if native upload replaces its DOM node',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),empty=document.querySelectorAll('.se-main-container p')[1],added=photo('사진0.png',true);nativeUpload(()=>empty.replaceWith(added));
  const result=await adapter.handle(request(before,1));expect(result).toMatchObject({ok:true,snapshot:{uploadPending:false,canUndo:true}});if(result.ok)expect(result.snapshot.issue).toBeUndefined();
 });
 it('waits for every selected file when a batch arrives in stages',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),target=document.querySelector('p span')!.parentElement!,one=photo('사진0.png',true),two=photo('사진1.png',true);nativeUpload(()=>target.after(one));
  expect(await adapter.handle(request(before,0,'after',2))).toMatchObject({ok:true,snapshot:{uploadPending:true,canUndo:false}});
  one.after(two);const after=await adapter.snapshot();expect(after).toMatchObject({uploadPending:false,canUndo:true});expect(after.issue).toBeUndefined();
 });
 it('handles a native photo group by image count rather than component count',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),target=document.querySelector('p span')!.parentElement!,group=photo('사진0.png',true);group.className='se-component se-imageGroup';group.append(photo('사진1.png',true).querySelector('img')!);nativeUpload(()=>target.after(group));
  expect(await adapter.handle(request(before,0,'after',2))).toMatchObject({ok:true,snapshot:{uploadPending:false,canUndo:true}});
 });
 it.each(['position','text','caption','title'])('preserves the document without automatic undo if %s changes during upload',async change=>{
  const adapter=instance(),before=await adapter.snapshot(),target=document.querySelector('p span')!.parentElement!,added=photo('사진0.png',true);nativeUpload(()=>{
   if(change==='position')document.querySelectorAll('.se-main-container p')[2].after(added);else target.after(added);
   if(change==='text')document.querySelector('p span')!.textContent='업로드 중 사용자 글';
   if(change==='caption')document.querySelector('.se-module-image-caption span')!.textContent='사용자가 바꾼 캡션';
   if(change==='title')document.querySelector('.se-documentTitle p')!.textContent='새 제목';
  });const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockResolvedValue(true);
  await adapter.handle(request(before));const after=await adapter.snapshot();expect(after.issue).toContain('복구 안내');expect(after.canUndo).toBe(false);expect(added.isConnected).toBe(true);expect(undo).not.toHaveBeenCalled();
 });
 it('rejects a changed document or malformed files before moving the caret or opening upload',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),{changed,control}=nativeUpload(),click=vi.fn();control.addEventListener('click',click);
  const stale=request(before);stale.expected.revision='changed';expect((await adapter.handle(stale)).ok).toBe(false);
  expect((await adapter.handle({...request(before),files:[]})).ok).toBe(false);expect(adapter.reader.selectAt).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();expect((await adapter.snapshot()).revision).toBe(before.revision);
 });
 it('retains preceding undo when photo setup fails without editing the body',async()=>{
  const adapter=instance(),original=await adapter.snapshot(),html=root().innerHTML,span=document.querySelector('p span')!,range=document.createRange();range.selectNodeContents(span);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);adapter.reader.captureSelection();
  vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){(span as HTMLElement).style.fontSize='16px';(this as unknown as {didEdit:()=>void}).didEdit();});
  expect((await adapter.handle({type:'format',preset:{id:'size',name:'크기',description:'',format:{fontSize:16}}})).ok).toBe(true);const before=await adapter.snapshot();expect(before.canUndo).toBe(true);
  vi.spyOn(PublicEditorUI.prototype,'uploadPhotos').mockRejectedValueOnce(new Error('네이버 사진 추가 버튼을 찾지 못했어요.'));const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{root().innerHTML=html;return true;});
  expect((await adapter.handle(request(before)))).toMatchObject({ok:false});expect(undo).not.toHaveBeenCalled();expect(await adapter.snapshot()).toMatchObject({revision:before.revision,canUndo:true,uploadPending:false});
  expect((await adapter.handle({type:'undo'})).ok).toBe(true);expect((await adapter.snapshot()).revision).toBe(original.revision);
 });
 it('preserves user edits if the body changes while positioning the upload',async()=>{
  const adapter=instance(),before=await adapter.snapshot(),{changed}=nativeUpload();vi.mocked(adapter.reader.selectAt).mockImplementation(async()=>{document.querySelector('p span')!.textContent='사용자 새 글';});const undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockResolvedValue(true);
  expect((await adapter.handle(request(before))).ok).toBe(false);expect(document.querySelector('p span')!.textContent).toBe('사용자 새 글');expect(changed).not.toHaveBeenCalled();expect(undo).not.toHaveBeenCalled();
 });
 it('reports a stalled upload without undoing prior text or claiming success',async()=>{
  const adapter=instance(),before=await adapter.snapshot();nativeUpload();const started=Date.now(),undo=vi.spyOn(PublicEditorUI.prototype,'undo').mockResolvedValue(true);
  expect(await adapter.handle(request(before))).toMatchObject({ok:true,snapshot:{uploadPending:true,canUndo:false}});
  vi.useFakeTimers();vi.setSystemTime(started+121_000);const after=await adapter.snapshot();expect(after.revision).toBe(before.revision);expect(after.issue).toContain('업로드 완료를 확인하지 못');expect(after.uploadPending).toBe(false);expect(after.canUndo).toBe(false);expect(undo).not.toHaveBeenCalled();
 });
});
