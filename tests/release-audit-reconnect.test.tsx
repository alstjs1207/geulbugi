// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {SchedulePanel} from '../src/ui/SchedulePanel';
import {DemoEditor} from '../src/platform/demo';
import {DEFAULT_SCHEDULE} from '../src/core/schedule';
it('audit: keeps selected reservation after a temporary disconnect to the same document',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-19T04:00:00Z'));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const snapshot=new DemoEditor().snapshot();
 const props={snapshot,busy:false,preferences:DEFAULT_SCHEDULE,onApply:vi.fn().mockResolvedValue(true),onSave:vi.fn().mockResolvedValue(undefined)};
 try{
  await act(async()=>root.render(<SchedulePanel {...props}/>));
  await act(async()=>{const hour=host.querySelector<HTMLSelectElement>('[aria-label="예약 시"]')!;hour.value='22';hour.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='일주일 뒤')!.click();});
  const read=()=>({date:host.querySelector<HTMLInputElement>('[type=date]')!.value,hour:host.querySelector<HTMLSelectElement>('[aria-label="예약 시"]')!.value});
  const before=read();
  await act(async()=>root.render(<SchedulePanel {...props} snapshot={null}/>));
  await act(async()=>root.render(<SchedulePanel {...props} snapshot={snapshot}/>));
  console.log(JSON.stringify({before,after:read()}));
  expect(read()).toEqual(before);
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();}
});
