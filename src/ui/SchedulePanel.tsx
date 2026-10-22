import {useEffect,useRef,useState} from 'react';
import {CalendarClock,Plus,X} from 'lucide-react';
import type {EditorRequest,SchedulePreferences,Snapshot} from '../core/types';
import {DEFAULT_SCHEDULE,SCHEDULE_MINUTES,describePublishTime,koreanDate,nextSchedule,shiftScheduleDate,validatePublishTime} from '../core/schedule';
import {Notice} from './components';
import {supportsPublishTime,PUBLISH_TIME_RECONNECT} from '../core/editor-capabilities';

type Props={snapshot:Snapshot|null;preferences?:SchedulePreferences;busy:boolean;demo?:boolean;onApply:(request:EditorRequest,success:string)=>Promise<boolean>;onSave:(preferences:Partial<SchedulePreferences>)=>Promise<void>;onReconnect?:()=>void};
export function SchedulePanel({snapshot,preferences,busy,demo=false,onApply,onSave,onReconnect}:Props){
 const prefs=preferences??DEFAULT_SCHEDULE;
 const initial=()=>snapshot?.publishTime?.mode==='scheduled'?snapshot.publishTime:nextSchedule(prefs.defaultTime);
 const [draft,setDraft]=useState(initial),[now,setNow]=useState(Date.now),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const active=useRef(false),key=snapshot?snapshot.sessionId+':'+snapshot.documentKey:null;
 const lastDocument=useRef(key);
 useEffect(()=>{
  // A temporary disconnect is not a new document. Retain the choice while
  // disconnected, but initialize from the editor when another document arrives.
  if(key===null||key===lastDocument.current)return;
  lastDocument.current=key;setDraft(initial());setMessage('');setError('');
 },[key]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
 const reconnect=!!snapshot?.editable&&!supportsPublishTime(snapshot);
 const disabled=busy||saving,canApply=!!snapshot?.editable&&!snapshot.issue&&!snapshot.uploadBusy&&!reconnect;
 let validation='';try{validatePublishTime(draft,now);}catch(e){validation=e instanceof Error?e.message:String(e);}
 const change=(date:string,time=draft.time)=>{setDraft({mode:'scheduled',date,time});setMessage('');setError('');};
 async function save(next:Partial<SchedulePreferences>,text:string){
  if(active.current||disabled)return;active.current=true;setSaving(true);setError('');setMessage('');
  try{await onSave(next);setMessage(text);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{active.current=false;setSaving(false);}
 }
 async function apply(current=false){
  if(active.current||disabled||!canApply||!snapshot)return;active.current=true;setSaving(true);setError('');setMessage('');
  try{
   const value=validatePublishTime(current?{mode:'now'}:draft);
   const success=value.mode==='scheduled'?'예약 시간을 적용했어요. 네이버에서 확인 후 발행을 누르면 예약이 완료돼요.':'현재 발행으로 바꿨어요. 네이버에서 발행 시간을 확인해 주세요.';
   const ok=await onApply({type:'publish-time',value,expected:{sessionId:snapshot.sessionId,documentKey:snapshot.documentKey,revision:snapshot.revision}},success);
   if(!ok)return;setMessage(success);
   if(value.mode==='scheduled')try{await onSave({defaultTime:value.time});}catch{setError('예약 시간은 적용됐지만 다음에 사용할 시간을 저장하지 못했어요.');}
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{active.current=false;setSaving(false);}
 }
 return <section className="schedule-panel">
  <h2>예약 발행 설정</h2><p className="subline">날짜와 시간을 고르면 네이버 발행 설정에 적용해요.</p>
  <div className="schedule-native"><small>네이버 현재 설정</small><strong>{snapshot?.publishTime?describePublishTime(snapshot.publishTime):'발행 설정을 열면 확인할 수 있어요.'}</strong></div>
  <label className="stacked-label">예약 날짜<input type="date" value={draft.date} min={koreanDate(now)} disabled={disabled} onChange={e=>change(e.target.value)}/></label>
  <div className="schedule-days">{[{label:'오늘',date:koreanDate(now)},{label:'내일',date:shiftScheduleDate(koreanDate(now),1)},{label:'하루 뒤',date:shiftScheduleDate(draft.date||koreanDate(now),1)},{label:'일주일 뒤',date:shiftScheduleDate(draft.date||koreanDate(now),7)}].map(item=><button type="button" key={item.label} className="secondary small" disabled={disabled} onClick={()=>change(item.date)}>{item.label}</button>)}</div>
  <fieldset className="schedule-time" disabled={disabled}><legend>예약 시간</legend><div>
   <select aria-label="예약 시" value={draft.time.slice(0,2)} onChange={e=>change(draft.date,e.target.value+draft.time.slice(2))}>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(hour=><option key={hour} value={hour}>{hour}시</option>)}</select><span>:</span>
   <select aria-label="예약 분" value={draft.time.slice(3)} onChange={e=>change(draft.date,draft.time.slice(0,3)+e.target.value)}>{SCHEDULE_MINUTES.map(minute=><option key={minute} value={minute}>{minute}분</option>)}</select>
  </div><p className="helper">한국 시간 · 10분 단위</p></fieldset>
  <div className="section-title"><h3>자주 쓰는 시간</h3><button className="text-btn" disabled={disabled||prefs.times.includes(draft.time)||prefs.times.length>=8} onClick={()=>void save({times:[...prefs.times,draft.time]},'자주 쓰는 시간에 저장했어요.')}><Plus size={14}/>시간 저장</button></div>
  <div className="schedule-favorites">{prefs.times.map(time=><div key={time}><button className={time===draft.time?'active':''} disabled={disabled} onClick={()=>change(draft.date,time)}>{time}</button><button className="icon-btn" aria-label={time+' 시간 삭제'} disabled={disabled} onClick={()=>void save({times:prefs.times.filter(t=>t!==time)},'저장한 시간을 삭제했어요.')}><X size={12}/></button></div>)}</div>
  <p className="helper">마지막으로 적용한 시간은 다음 글에서도 기본으로 표시해요.</p>
  <div className="schedule-summary"><CalendarClock size={20}/><div><small>적용할 예약 시간</small><strong>{describePublishTime(draft)}</strong></div></div>
  {validation&&<Notice tone="warning">{validation}</Notice>}
  {reconnect?<Notice tone="warning">{PUBLISH_TIME_RECONNECT}{onReconnect&&<button className="secondary small" onClick={onReconnect}>확장 관리 열기</button>}</Notice>:!canApply&&<Notice>네이버 PC 글쓰기 탭에 연결하고 진행 중인 편집을 마친 뒤 적용해 주세요.</Notice>}
  <button className="primary full" disabled={disabled||!canApply||!!validation} onClick={()=>void apply()}><CalendarClock size={17}/>{saving?'처리 중':'예약 설정 적용'}</button>
  {snapshot?.publishTime?.mode==='scheduled'&&<button className="text-btn schedule-reset" disabled={disabled||!canApply} onClick={()=>void apply(true)}>현재 발행으로 전환</button>}
  {message&&<p className="schedule-message" role="status">{demo?'예시 문서: ':''}{message}</p>}{error&&<p className="schedule-error" role="alert">{error}</p>}
 </section>;
}
