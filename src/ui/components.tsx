import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Info, MapPin, LoaderCircle, CheckCircle2 } from 'lucide-react';
import type { Run, Block } from '../core/types';
import { safeHref } from '../core/security';
export function RichText({runs}:{runs:Run[]}){
 return <>{runs.map((run,index)=><span key={index} style={{fontWeight:run.marks.bold?700:undefined,fontStyle:run.marks.italic?'italic':undefined,textDecoration:run.marks.underline?'underline':undefined,color:run.marks.color,backgroundColor:run.marks.background,fontSize:run.marks.fontSize?run.marks.fontSize+'px':undefined}}>{safeHref(run.marks.href)?<a href={safeHref(run.marks.href)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{run.text}</a>:run.text}</span>)}</>;
}
export function Notice({children,tone='info'}:{children:ReactNode;tone?:'info'|'warning'|'success'}){return <div className={'notice '+tone}><Info size={16}/><span>{children}</span></div>;}
export const EventNoticeContext=createContext<{message:{text:string;error?:boolean}|null;onDismiss:()=>void}|null>(null);
export function EventNotice(){
 const notice=useContext(EventNoticeContext);if(!notice?.message)return null;
 const {message,onDismiss}=notice;
 return <div className={'event-notice '+(message.error?'error':'')} role={message.error?'alert':'status'}>{message.error?<Info size={18}/>:<CheckCircle2 size={18}/>}<span>{message.text}</span><button type="button" aria-label="알림 닫기" onClick={onDismiss}><X size={16}/></button></div>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const dialog=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const element=dialog.current;const first=element?.querySelector<HTMLElement>('button,input,select,textarea,[tabindex="0"]');first?.focus();
  const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}if(event.key!=='Tab'||!element)return;const focusable=[...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')];if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[]);
 return <div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className={'modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={20}/></button></header><EventNotice/>{children}</section></div>;
}
export function Empty({title,body,children}:{title:string;body:string;children?:ReactNode}){return <div className="empty-state"><div className="empty-icon"><MapPin size={25}/></div><h3>{title}</h3><p>{body}</p>{children}</div>;}
export function Busy({label}:{label:string}){return <span className="busy-label"><LoaderCircle size={15} className="spin"/>{label}</span>;}
export function WindowedBlocks({blocks,selected,onSelect,ordinal,focusToken=0}:{blocks:Block[];selected:string;onSelect:(id:string)=>void;ordinal:Map<string,number>;focusToken?:number}){
 const [top,setTop]=useState(0),container=useRef<HTMLDivElement>(null);const height=224,row=48,overscan=3;
 const contentKey=blocks.map(b=>b.id).join(',');
 useEffect(()=>{const viewport=container.current;if(!viewport)return;const index=blocks.findIndex(b=>b.id===selected);const next=index<0?0:Math.max(0,Math.min(blocks.length*row-height,index*row-height/2+row/2));viewport.scrollTop=next;setTop(next);},[contentKey,selected,focusToken]);
 const clamped=Math.min(top,Math.max(0,blocks.length*row-height)),start=Math.max(0,Math.floor(clamped/row)-overscan),end=Math.min(blocks.length,start+Math.ceil(height/row)+overscan*2);
 return <div ref={container} className="windowed" style={{maxHeight:height}} onScroll={e=>setTop(e.currentTarget.scrollTop)}><div style={{height:blocks.length*row,position:'relative'}}>{blocks.slice(start,end).map((block,index)=><button key={block.id} style={{position:'absolute',top:(start+index)*row,height:row-3,left:0,right:0}} className={'paragraph-row '+(selected===block.id?'chosen':'')} onClick={()=>onSelect(block.id)}><span className="number">{String(ordinal.get(block.id)??0).padStart(2,'0')}</span><span className="paragraph-text">{block.text||'빈 문단'}</span>{block.kind==='heading'&&<span className="tiny-tag">소제목</span>}</button>)}</div></div>;
}
