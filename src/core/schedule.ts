import type {PublishTime,SchedulePreferences} from './types';

export const SCHEDULE_MINUTES=['00','10','20','30','40','50'] as const;
export const DEFAULT_SCHEDULE:SchedulePreferences={defaultTime:'09:00',times:['09:00','12:00','18:00']};
export function validScheduleTime(value:unknown):value is string{
 return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]0$/.test(value);
}
export function validateSchedulePreferences(value:unknown):SchedulePreferences{
 if(!value||typeof value!=='object')throw new Error('예약 시간 설정을 확인해 주세요.');
 const p=value as SchedulePreferences;
 if(!validScheduleTime(p.defaultTime)||!Array.isArray(p.times)||p.times.length>8||p.times.some(t=>!validScheduleTime(t)))throw new Error('예약 시간은 10분 단위로 최대 8개까지 저장할 수 있어요.');
 return {defaultTime:p.defaultTime,times:[...new Set(p.times)]};
}
export function koreanDate(now=Date.now()):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 return ['year','month','day'].map(key=>parts.find(p=>p.type===key)!.value).join('-');
}
export function shiftScheduleDate(date:string,days:number):string{
 const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);
 return value.toISOString().slice(0,10);
}
export function validatePublishTime(value:unknown,now=Date.now()):PublishTime{
 if(!value||typeof value!=='object')throw new Error('발행 시간을 선택해 주세요.');
 const v=value as PublishTime;
 if(v.mode==='now')return {mode:'now'};
 if(v.mode!=='scheduled'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!validScheduleTime(v.time))throw new Error('예약 날짜와 10분 단위 시간을 선택해 주세요.');
 const when=new Date(v.date+'T'+v.time+':00+09:00').getTime();
 if(!Number.isFinite(when)||koreanDate(when)!==v.date)throw new Error('예약 날짜를 확인해 주세요.');
 if(when<=now)throw new Error('지금보다 뒤의 예약 시간을 선택해 주세요.');
 return {mode:'scheduled',date:v.date,time:v.time};
}
export function nextSchedule(time=DEFAULT_SCHEDULE.defaultTime,now=Date.now()):Extract<PublishTime,{mode:'scheduled'}>{
 const today=koreanDate(now),date=new Date(today+'T'+time+':00+09:00').getTime()>now?today:shiftScheduleDate(today,1);
 return {mode:'scheduled',date,time};
}
export function describePublishTime(value:PublishTime):string{
 return value.mode==='now'?'현재 발행':value.date.replaceAll('-','.')+' '+value.time+' 예약';
}
