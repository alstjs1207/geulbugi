// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {SchedulePanel} from '../src/ui/SchedulePanel';
import {DemoEditor} from '../src/platform/demo';
import {DEFAULT_SCHEDULE} from '../src/core/schedule';
import type {EditorRequest,SchedulePreferences,Snapshot} from '../src/core/types';

let host:HTMLDivElement,root:Root,snapshot:Snapshot;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-11T08:20:05Z'));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);snapshot=new DemoEditor().snapshot();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
const dateInput=()=>host.querySelector<HTMLInputElement>('input[type=date]')!;
async function chooseTime(hour:string,minute:string){
 await act(async()=>{const el=host.querySelector<HTMLSelectElement>('select[aria-label="예약 시"]')!;el.value=hour;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>{const el=host.querySelector<HTMLSelectElement>('select[aria-label="예약 분"]')!;el.value=minute;el.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function click(text:string){await act(async()=>button(text).click());}
function props(){return {snapshot,busy:false,preferences:structuredClone(DEFAULT_SCHEDULE),onApply:vi.fn<(r:EditorRequest,s:string)=>Promise<boolean>>().mockResolvedValue(true),onSave:vi.fn<(p:Partial<SchedulePreferences>)=>Promise<void>>().mockResolvedValue(undefined)};}
describe('reservation panel without a body selection',()=>{
 it('defaults to the next Korean date, sends the document identity and remembers only a successfully applied time',async()=>{
  const p=props();p.snapshot.selection=null;await act(async()=>root.render(<SchedulePanel {...p}/>));
  expect(dateInput().value).toBe('2026-10-12');expect(button('예약 설정 적용').disabled).toBe(false);
  await chooseTime('10','40');await click('예약 설정 적용');
  expect(p.onApply.mock.calls[0][0]).toEqual({type:'publish-time',value:{mode:'scheduled',date:'2026-10-12',time:'10:40'},expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}});
  expect(p.onSave).toHaveBeenCalledWith({defaultTime:'10:40'});expect(host.querySelector('[role=status]')?.textContent).toContain('확인 후 발행');
 });
 it('saves a favorite without changing the native settings and reports storage failures inline',async()=>{
  const p=props();await act(async()=>root.render(<SchedulePanel {...p}/>));await chooseTime('10','40');await click('시간 저장');
  expect(p.onSave).toHaveBeenCalledExactlyOnceWith({times:[...DEFAULT_SCHEDULE.times,'10:40']});expect(p.onApply).not.toHaveBeenCalled();
  p.onSave.mockRejectedValueOnce(new Error('저장 공간이 부족해요.'));await chooseTime('11','40');await click('시간 저장');
  expect(host.querySelector('[role=alert]')?.textContent).toBe('저장 공간이 부족해요.');expect(p.onApply).not.toHaveBeenCalled();
 });
 it('preserves draft choices across snapshot refreshes and resets them for a different document',async()=>{
  const p=props();await act(async()=>root.render(<SchedulePanel {...p}/>));await chooseTime('10','40');await click('일주일 뒤');
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={{...snapshot,revision:'new-body-revision'}}/>));expect(dateInput().value).toBe('2026-10-19');expect(host.querySelector<HTMLSelectElement>('select[aria-label="예약 시"]')!.value).toBe('10');
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={{...snapshot,documentKey:'other-document',publishTime:{mode:'scheduled',date:'2026-10-15',time:'18:30'}}}/>));expect(dateInput().value).toBe('2026-10-15');expect(host.querySelector<HTMLSelectElement>('select[aria-label="예약 분"]')!.value).toBe('30');
 });
 it('blocks passed time, unavailable editors and uploads, but permits a document with unloaded photos',async()=>{
  const p=props();await act(async()=>root.render(<SchedulePanel {...p}/>));await click('오늘');expect(button('예약 설정 적용').disabled).toBe(true);
  await click('18:00');expect(button('예약 설정 적용').disabled).toBe(false);
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={{...snapshot,uploadBusy:true}}/>));expect(button('예약 설정 적용').disabled).toBe(true);
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={{...snapshot,mediaPending:true}}/>));expect(button('예약 설정 적용').disabled).toBe(false);
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={null}/>));expect(button('예약 설정 적용').disabled).toBe(true);
  expect(p.onApply).not.toHaveBeenCalled();
 });
 it('does not save preferences or claim completion when the native request fails',async()=>{
  const p=props();p.onApply.mockResolvedValue(false);await act(async()=>root.render(<SchedulePanel {...p}/>));await click('예약 설정 적용');
  expect(p.onSave).not.toHaveBeenCalled();expect(host.querySelector('[role=status]')).toBeNull();expect(button('예약 설정 적용').disabled).toBe(false);
 });
 it('prevents duplicate application and leaves the date unchanged after switching to current time',async()=>{
  let finish!:(value:boolean)=>void;const p=props();p.snapshot.publishTime={mode:'scheduled',date:'2026-10-12',time:'10:40'};
  p.onApply.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>root.render(<SchedulePanel {...p}/>));
  await click('예약 설정 적용');await act(async()=>{host.querySelector<HTMLButtonElement>('.primary')!.click();});expect(p.onApply).toHaveBeenCalledOnce();await act(async()=>finish(true));
  p.onApply.mockResolvedValue(true);p.onSave.mockClear();await click('현재 발행으로 전환');expect(p.onApply.mock.calls.at(-1)![0]).toMatchObject({type:'publish-time',value:{mode:'now'}});expect(p.onSave).not.toHaveBeenCalled();expect(dateInput().value).toBe('2026-10-12');
 });
 it('shows refresh instructions for a legacy editor and preserves choices after reconnecting',async()=>{
  const p=props(),onReconnect=vi.fn(),legacy={...snapshot,adapterSignature:'naver-one-public-ui-v26',capabilities:undefined,publishTime:undefined};
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={legacy} onReconnect={onReconnect}/>));
  expect(button('예약 설정 적용').disabled).toBe(true);expect(host.textContent).toContain('초안을 임시저장');expect(host.textContent).toContain('네이버 글쓰기 탭도 새로고침');
  await chooseTime('10','40');await click('확장 관리 열기');expect(onReconnect).toHaveBeenCalledOnce();expect(p.onApply).not.toHaveBeenCalled();
  await act(async()=>root.render(<SchedulePanel {...p} onReconnect={onReconnect}/>));
  expect(button('예약 설정 적용').disabled).toBe(false);expect(host.textContent).not.toContain('이전 확장 코드');
  await click('예약 설정 적용');expect(p.onApply.mock.calls[0][0]).toMatchObject({value:{time:'10:40'}});
 });
 it('permits the previous reservation release without capability metadata',async()=>{
  const p=props();p.snapshot={...snapshot,adapterSignature:'naver-one-public-ui-v27',capabilities:undefined};
  await act(async()=>root.render(<SchedulePanel {...p}/>));expect(button('예약 설정 적용').disabled).toBe(false);
  await click('예약 설정 적용');expect(p.onApply).toHaveBeenCalledOnce();
 });
 it('keeps the same document draft through repeated disconnects but resets a different document after reconnect',async()=>{
  const p=props();await act(async()=>root.render(<SchedulePanel {...p}/>));await chooseTime('22','40');await click('일주일 뒤');
  const selectedDate=dateInput().value;
  for(let i=0;i<2;i++){
   await act(async()=>root.render(<SchedulePanel {...p} snapshot={null}/>));
   expect(dateInput().value).toBe(selectedDate);expect(button('예약 설정 적용').disabled).toBe(true);
   await act(async()=>root.render(<SchedulePanel {...p}/>));
   expect(dateInput().value).toBe(selectedDate);expect(host.querySelector<HTMLSelectElement>('[aria-label="예약 시"]')!.value).toBe('22');
  }
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={null}/>));
  await act(async()=>root.render(<SchedulePanel {...p} snapshot={{...snapshot,sessionId:'new-session',documentKey:'another-post',publishTime:{mode:'scheduled',date:'2026-10-23',time:'18:30'}}}/>));
  expect(dateInput().value).toBe('2026-10-23');expect(host.querySelector<HTMLSelectElement>('[aria-label="예약 시"]')!.value).toBe('18');
 });
});
