import type {PublishTime} from '../core/types';
import {validatePublishTime} from '../core/schedule';
import {PendingNativeEditError} from './native-operation';

const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
function visible(el:HTMLElement):boolean{
 const r=el.getBoundingClientRect(),s=getComputedStyle(el);
 return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]');
}
function enabled(el:HTMLElement):boolean{
 return !el.matches(':disabled,[aria-disabled="true"],.ui-state-disabled')&&!el.closest('.ui-state-disabled')&&getComputedStyle(el).pointerEvents!=='none';
}
// Only the header control opens settings. The final seOnePublishBtn is never clicked.
export class PublishTimeUI{
 constructor(private guard:()=>void=()=>{}){}
 private root():HTMLElement|null{
  const roots=[...document.querySelectorAll<HTMLElement>('[class*="layer_content_set_publish"]')].filter(visible);
  return roots.length===1?roots[0]:null;
 }
 private radio(root:HTMLElement,mode:PublishTime['mode']):HTMLInputElement|null{
  return root.querySelector<HTMLInputElement>('input[name="radio_time"][value="'+(mode==='now'?'now':'pre')+'"]');
 }
 read():PublishTime|undefined{
  const root=this.root();if(!root)return;
  if(this.radio(root,'now')?.checked)return {mode:'now'};
  if(!this.radio(root,'scheduled')?.checked)return;
  const date=root.querySelector<HTMLInputElement>('input[class*="input_date"]')?.value.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
  const hour=root.querySelector<HTMLSelectElement>('select[title="예약 발행 시간 선택"]')?.value,minute=root.querySelector<HTMLSelectElement>('select[title="예약 발행 분 선택"]')?.value;
  if(date&&hour&&minute)return {mode:'scheduled',date:date[1]+'-'+date[2].padStart(2,'0')+'-'+date[3].padStart(2,'0'),time:hour+':'+minute};
 }
 private async wait<T>(get:()=>T|undefined|null|false,message:string,pending=false):Promise<T>{
  const end=Date.now()+(pending?4000:2000);
  do{this.guard();const value=get();if(value)return value;await pause();}while(Date.now()<end);
  throw pending?new PendingNativeEditError(message):new Error(message);
 }
 private async open():Promise<HTMLElement>{
  const root=this.root();if(root)return root;
  if([...document.querySelectorAll<HTMLElement>('.se-popup')].some(visible))throw new Error('열려 있는 네이버 창을 닫은 뒤 예약 시간을 설정해 주세요.');
  const controls=[...document.querySelectorAll<HTMLButtonElement>('button[data-click-area="tpb.publish"]')].filter(b=>visible(b)&&enabled(b)&&b.textContent?.trim()==='발행');
  if(controls.length!==1)throw new Error('네이버 발행 설정 버튼을 찾지 못했어요. 글쓰기 화면에서 다시 실행해 주세요.');
  this.guard();controls[0].click();
  return this.wait(()=>this.root(),'네이버 발행 설정을 열지 못했어요. 네이버 화면에서 제목과 본문을 확인해 주세요.');
 }
 private async chooseMode(mode:PublishTime['mode']):Promise<HTMLElement>{
  const root=await this.open(),radio=this.radio(root,mode);
  if(!radio||!enabled(radio))throw new Error('이 글에서는 네이버 예약 시간 옵션을 사용할 수 없어요.');
  const changing=!radio.checked;
  if(changing){
   const label=[...root.querySelectorAll<HTMLLabelElement>('label[for]')].find(el=>el.htmlFor===radio.id&&visible(el));
   if(!label)throw new Error('네이버 발행 시간 선택 항목을 찾지 못했어요.');
   this.guard();label.click();
  }
  return this.wait(()=>{const current=this.root();return current&&this.radio(current,mode)?.checked?current:undefined;},'네이버 발행 시간 선택 결과를 아직 확인하지 못했어요.',changing);
 }
 private calendar(root:HTMLElement):HTMLElement|undefined{
  const all=[...root.querySelectorAll<HTMLElement>('[data-focus-lock="PrePostDate"] .ui-datepicker')].filter(visible);
  return all.length===1?all[0]:undefined;
 }
 private month(calendar:HTMLElement):number{
  const year=Number(calendar.querySelector('.ui-datepicker-year')?.textContent),month=Number(calendar.querySelector('.ui-datepicker-month')?.textContent?.replace('월',''));
  if(!Number.isInteger(year)||year<1970||!Number.isInteger(month)||month<1||month>12)throw new Error('네이버 달력의 연월을 확인하지 못했어요.');
  return year*12+month-1;
 }
 private async chooseDate(date:string):Promise<void>{
  const root=this.root()!,input=root.querySelector<HTMLInputElement>('input[class*="input_date"]');
  if(!input||!visible(input))throw new Error('네이버 예약 날짜를 찾지 못했어요.');
  const current=this.read();if(current?.mode==='scheduled'&&current.date===date&&!this.calendar(root))return;
  if(!this.calendar(root)){this.guard();input.click();}
  let calendar=await this.wait(()=>this.root()&&this.calendar(this.root()!),'네이버 예약 달력을 열지 못했어요.');
  const [year,month,day]=date.split('-').map(Number),target=year*12+month-1;
  // Bound public navigation so a malformed or distant request cannot loop indefinitely.
  if(Math.abs(target-this.month(calendar))>24)throw new Error('가까운 예약 날짜를 선택하거나 네이버 달력에서 직접 설정해 주세요.');
  for(let step=0;this.month(calendar)!==target&&step<24;step++){
   const before=this.month(calendar),selector=target>before?'.ui-datepicker-next':'.ui-datepicker-prev';
   const button=calendar.querySelector<HTMLElement>(selector);
   if(!button||!visible(button)||!enabled(button))throw new Error('네이버 달력에서 선택할 수 없는 예약 날짜예요. 날짜를 다시 선택해 주세요.');
   this.guard();button.click();
   calendar=await this.wait(()=>{const r=this.root(),c=r&&this.calendar(r);return c&&this.month(c)!==before?c:undefined;},'네이버 달력의 월 변경을 아직 확인하지 못했어요.',true);
  }
  if(this.month(calendar)!==target)throw new Error('네이버 달력에서 예약 날짜를 확인해 주세요.');
  const days=[...calendar.querySelectorAll<HTMLButtonElement>('td button')].filter(b=>b.textContent?.trim()===String(day)&&visible(b)&&enabled(b));
  if(days.length!==1)throw new Error('네이버 달력에서 선택할 수 없는 예약 날짜예요. 날짜를 다시 선택해 주세요.');
  this.guard();days[0].click();
  await this.wait(()=>{const v=this.read();return v?.mode==='scheduled'&&v.date===date;},'네이버 예약 날짜 적용을 아직 확인하지 못했어요.',true);
 }
 private async select(title:string,value:string):Promise<void>{
  const controls=[...this.root()!.querySelectorAll<HTMLSelectElement>('select')].filter(el=>el.title===title&&visible(el)&&enabled(el));
  if(controls.length!==1||![...controls[0].options].some(o=>o.value===value&&!o.disabled))throw new Error('네이버에서 선택할 수 없는 예약 시간이에요.');
  this.guard();const el=controls[0];if(el.value===value)return;
  const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
  setter.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));
  let matching=0;
  await this.wait(()=>{
   const root=this.root(),matches=root?[...root.querySelectorAll<HTMLSelectElement>('select')].filter(control=>control.title===title&&visible(control)&&enabled(control)):[];
   if(matches.length!==1||matches[0].value!==value){matching=0;return;}
   return ++matching>=3?true:undefined;
  },'네이버 예약 시간 선택의 완료를 아직 확인하지 못했어요.',true);
 }
 private async setTime(value:PublishTime):Promise<void>{
  await this.chooseMode(value.mode);
  if(value.mode==='scheduled'){
   await this.chooseDate(value.date);
   await this.select('예약 발행 시간 선택',value.time.slice(0,2));
   await this.select('예약 발행 분 선택',value.time.slice(3));
  }
  await this.wait(()=>JSON.stringify(this.read())===JSON.stringify(value),'네이버 예약 시간 적용을 확인하지 못했어요. 발행 설정에서 날짜와 시간을 확인해 주세요.');
  this.guard();
 }
 async apply(input:PublishTime):Promise<PublishTime>{
  const value=validatePublishTime(input);this.guard();await this.open();const before=this.read();
  try{await this.setTime(value);return validatePublishTime(value);}
  catch(error){
   if(error instanceof PendingNativeEditError)throw error;
   let message=error instanceof Error?error.message:String(error);
   // Restore only these public settings, never body history. A trusted user
   // interaction or document change invalidates guard and prevents rollback.
   if(before)try{this.guard();await this.setTime(before);message+=' 예약 설정을 원래대로 돌렸어요.';}catch{message+=' 네이버 발행 설정에서 현재 날짜와 시간을 확인해 주세요.';}
   throw new Error(message);
  }
 }
}
