// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {PublishTimeUI} from '../src/editor/publish-time';
import {NativeAdapter} from '../src/editor/native-adapter';
import {PublicEditorUI} from '../src/editor/public-ui';
import {defaultDatabase} from '../src/core/defaults';
import {saveDatabase} from '../src/platform/storage';

const baseline='<div class="se-editor"><div class="se-main-container"><div contenteditable="true"><p class="se-text-paragraph"><span>기존 글과 서식</span></p></div></div></div>';
const value={mode:'scheduled',date:'2026-11-02',time:'09:40'} as const;
let published=vi.fn(()=>{}),adapters:NativeAdapter[]=[];
function fixture(open=false){
 let selectedDate='2026. 10. 11',month=10;
 document.body.innerHTML=baseline+'<button data-click-area="tpb.publish">발행</button><div class="layer_content_set_publish__test" hidden><input id="radio_time1" name="radio_time" type="radio" value="now" checked><label for="radio_time1">현재</label><input id="radio_time2" name="radio_time" type="radio" value="pre"><label for="radio_time2">예약</label><input id="open_private" name="open_type" type="radio" checked><input id="allow_comment" type="checkbox" checked><span>카테고리 유지</span><div id="time"></div><button data-testid="seOnePublishBtn">발행</button></div>';
 const root=document.querySelector<HTMLElement>('[class*=layer_content_set_publish]')!;
 published=vi.fn(()=>{});root.querySelector('button')!.addEventListener('click',published);
 const controls=()=>{
  document.getElementById('time')!.innerHTML='<div><input readonly class="input_date__test" value="'+selectedDate+'"><div id="calendar"></div></div><select title="예약 발행 시간 선택">'+Array.from({length:24},(_,h)=>String(h).padStart(2,'0')).map(h=>'<option>'+h+'</option>').join('')+'</select><select title="예약 발행 분 선택">'+['00','10','20','30','40','50'].map(m=>'<option>'+m+'</option>').join('')+'</select>';
  root.querySelector('input[readonly]')!.addEventListener('click',calendar);
 };
 const calendar=()=>{
  document.getElementById('calendar')!.innerHTML='<div data-focus-lock="PrePostDate"><div class="ui-datepicker"><span class="ui-datepicker-year">2026</span><span class="ui-datepicker-month">'+month+'월</span><button class="ui-datepicker-prev" title="이전달">이전 달</button><button class="ui-datepicker-next" title="다음달">다음 달</button><table><tbody><tr>'+Array.from({length:31},(_,i)=>'<td><button>'+String(i+1)+'</button></td>').join('')+'</tr></tbody></table></div></div>';
  root.querySelector('.ui-datepicker-next')!.addEventListener('click',()=>{month++;calendar();});
  root.querySelector('.ui-datepicker-prev')!.addEventListener('click',()=>{month--;calendar();});
  root.querySelectorAll('td button').forEach(b=>b.addEventListener('click',()=>{selectedDate='2026. '+month+'. '+b.textContent;root.querySelector<HTMLInputElement>('input[readonly]')!.value=selectedDate;document.getElementById('calendar')!.innerHTML='';}));
 };
 root.querySelector<HTMLInputElement>('#radio_time2')!.addEventListener('change',controls);
 document.querySelector<HTMLButtonElement>('button[data-click-area="tpb.publish"]')!.addEventListener('click',()=>{root.hidden=false;});
 if(open)root.hidden=false;
 return root;
}
beforeEach(async()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-11T08:20:05Z'));
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({width:120,height:30,x:0,y:0,top:0,left:0,bottom:30,right:120,toJSON(){}}));
 vi.stubGlobal('location',{href:'https://blog.naver.com/PostWriteForm.naver?blogId=example_blog',pathname:'/PostWriteForm.naver'});
 vi.stubGlobal('chrome',undefined);const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});await saveDatabase(defaultDatabase());
});
afterEach(()=>{adapters.forEach(a=>a.reader.dispose());adapters=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('native publishing-time settings through public controls',()=>{
 it('opens only the header, changes calendar month and date, and verifies hour and minute without publishing',async()=>{
  const root=fixture(),before=document.querySelector('.se-main-container')!.outerHTML;
  expect(await new PublishTimeUI().apply(value)).toEqual(value);
  expect(new PublishTimeUI().read()).toEqual(value);expect(document.querySelector('.se-main-container')!.outerHTML).toBe(before);
  expect(root.querySelector<HTMLInputElement>('#open_private')!.checked).toBe(true);expect(root.querySelector<HTMLInputElement>('#allow_comment')!.checked).toBe(true);expect(published).not.toHaveBeenCalled();
 });
 it('reuses an open publishing panel and an open calendar, and can switch to current publishing time',async()=>{
  const root=fixture(true);root.querySelector<HTMLLabelElement>('label[for=radio_time2]')!.click();root.querySelector<HTMLInputElement>('input[readonly]')!.click();
  const header=vi.spyOn(document.querySelector<HTMLButtonElement>('button[data-click-area="tpb.publish"]')!,'click');
  await new PublishTimeUI().apply(value);expect(header).not.toHaveBeenCalled();await new PublishTimeUI().apply({mode:'now'});
  expect(new PublishTimeUI().read()).toEqual({mode:'now'});expect(published).not.toHaveBeenCalled();
 });
 it('rejects past times and unsupported minutes before opening or changing settings',async()=>{
  fixture();const before=document.body.innerHTML;
  await expect(new PublishTimeUI().apply({...value,date:'2026-10-11',time:'17:20'})).rejects.toThrow(/뒤/);
  await expect(new PublishTimeUI().apply({...value,time:'09:05'})).rejects.toThrow(/10분/);
  expect(document.body.innerHTML).toBe(before);expect(published).not.toHaveBeenCalled();
 });
 it('never falls back to the final publish button when the safe opener is missing',async()=>{
  fixture();document.querySelector('button[data-click-area="tpb.publish"]')!.remove();
  await expect(new PublishTimeUI().apply(value)).rejects.toThrow(/버튼/);expect(published).not.toHaveBeenCalled();
 });
 it('honors disabled native calendar months and days',async()=>{
  const root=fixture(true);root.querySelector<HTMLLabelElement>('label[for=radio_time2]')!.click();root.querySelector<HTMLInputElement>('input[readonly]')!.click();
  root.querySelector('.ui-datepicker-next')!.classList.add('ui-state-disabled');
  await expect(new PublishTimeUI().apply(value)).rejects.toThrow(/선택할 수 없는/);
  expect(published).not.toHaveBeenCalled();expect(new PublishTimeUI().read()).toMatchObject({mode:'scheduled',date:'2026-10-11'});
  root.querySelector<HTMLInputElement>('input[readonly]')!.click();const day=root.querySelector('td:nth-child(12)')!;day.classList.add('ui-state-disabled');
  await expect(new PublishTimeUI().apply({...value,date:'2026-10-12'})).rejects.toThrow(/선택할 수 없는/);
 });
 it('stops before touching any control when the source document guard fails',async()=>{
  fixture();const before=document.body.innerHTML;
  await expect(new PublishTimeUI(()=>{throw new Error('글이 바뀌었어요.');}).apply(value)).rejects.toThrow(/글이/);
  expect(document.body.innerHTML).toBe(before);expect(published).not.toHaveBeenCalled();
 });
 it('restores the previous time after a partial failure without publishing or using body undo',async()=>{
  const root=fixture(true);root.querySelector<HTMLLabelElement>('label[for=radio_time2]')!.click();
  root.querySelector('select[title="예약 발행 분 선택"] option:nth-child(5)')!.remove();
  const before=new PublishTimeUI().read(),body=document.querySelector('.se-main-container')!.outerHTML;
  await expect(new PublishTimeUI().apply(value)).rejects.toThrow(/원래대로/);
  expect(new PublishTimeUI().read()).toEqual(before);expect(document.querySelector('.se-main-container')!.outerHTML).toBe(body);expect(published).not.toHaveBeenCalled();
 });
 it('preserves the native adapter body undo and rejects an outdated panel request',async()=>{
  fixture();vi.spyOn(PublicEditorUI.prototype,'format').mockImplementation(async function(this:PublicEditorUI){document.querySelector<HTMLElement>('p span')!.style.fontWeight='700';(this as unknown as {didEdit:()=>void}).didEdit();});
  vi.spyOn(PublicEditorUI.prototype,'undo').mockImplementation(async()=>{document.querySelector<HTMLElement>('p span')!.style.fontWeight='';return true;});
  const adapter=new NativeAdapter();adapters.push(adapter);const node=document.querySelector('p span')!.firstChild!,range=document.createRange();range.selectNodeContents(node);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);adapter.reader.captureSelection();const original=await adapter.snapshot();
  await adapter.handle({type:'format',preset:{id:'bold',name:'굵게',description:'',format:{bold:true}}});const before=await adapter.snapshot();
  expect(before.canUndo).toBe(true);expect(await adapter.handle({type:'publish-time',value,expected:before})).toMatchObject({ok:true,snapshot:{canUndo:true,publishTime:value,revision:before.revision}});
  expect((await adapter.handle({type:'publish-time',value:{mode:'now'},expected:original})).ok).toBe(false);
  expect((await adapter.snapshot()).canUndo).toBe(true);expect((await adapter.handle({type:'undo'})).ok).toBe(true);expect((await adapter.snapshot()).revision).toBe(original.revision);
  expect(published).not.toHaveBeenCalled();
 });
});
