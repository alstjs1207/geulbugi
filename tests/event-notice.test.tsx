// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {App} from '../src/ui/App';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function click(text:string){await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click();});}
it('routes a live notification into an open dialog and back without duplicating it',async()=>{
 await act(async()=>root.render(<App/>));
 await click('선택 영역에 적용');
 expect(host.querySelector('.panel>.event-notice')?.getAttribute('role')).toBe('status');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="설정"]')!.click());
 expect(host.querySelectorAll('.event-notice')).toHaveLength(1);
 expect(host.querySelector('[role="dialog"]>.event-notice')?.getAttribute('role')).toBe('status');
 await click('프리셋 단축키');
 await click('크롬에서 키 조합 지정');
 expect(host.querySelector('[role="dialog"]>.event-notice')?.getAttribute('role')).toBe('alert');
 expect(host.querySelector('.event-notice')?.textContent).toContain('크롬 확장 설치 후');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!.click());
 expect(host.querySelectorAll('.event-notice')).toHaveLength(1);
 expect(host.querySelector('.panel>.event-notice')?.getAttribute('role')).toBe('alert');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="알림 닫기"]')!.click());
 expect(host.querySelector('.event-notice')).toBeNull();
});
