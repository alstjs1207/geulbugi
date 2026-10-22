import {useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {NAVER_COLORS,isNaverColor} from '../core/naver-format-options';

export function NaverColorPicker({label,value,disabled,onChange}:{label:string;value:string;disabled:boolean;onChange:(color:string)=>void}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),supported=isNaverColor(value),normalized=value.toLowerCase();
 return <div className="native-color-picker" onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
  <button ref={trigger} type="button" className="native-color-trigger" disabled={disabled} aria-label={label+' 선택'} aria-expanded={open&&!disabled} onClick={()=>setOpen(!open)}><i style={{background:supported?normalized:undefined}}/>{supported?normalized:'지원 색상 선택'}<ChevronDown size={14}/></button>
  {open&&!disabled&&<div className="native-color-options" role="group" aria-label={label+' 네이버 지원 색상'}><p>네이버 기본 팔레트 · {NAVER_COLORS.length}색</p><div className="native-color-grid">{NAVER_COLORS.map(color=><button key={color} type="button" style={{background:color}} aria-label={label+' '+color} aria-pressed={color===normalized} title={color} onClick={()=>{onChange(color);setOpen(false);trigger.current?.focus();}}>{color===normalized&&<Check size={13} style={{color:'#000',filter:'drop-shadow(0 0 1px #fff)'}}/>}</button>)}</div></div>}
 </div>;
}
