import {useState} from 'react';
import type {Format,Preset} from '../core/types';
import {NAVER_FONT_SIZES,assertNaverFormat,naverFormatIssue,resolveQuoteStyle} from '../core/naver-format-options';
import {Modal,Notice} from './components';
import {NaverColorPicker} from './NaverColorPicker';
import {QuoteStylePicker} from './QuoteStylePicker';

export function PresetDialog({preset,onClose,onSave,onDelete}:{preset:Preset;onClose:()=>void;onSave:(p:Preset)=>Promise<void>;onDelete?:()=>Promise<void>}){
 const [draft,setDraft]=useState(()=>structuredClone(preset)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const patch=(key:keyof Format,value:Format[keyof Format]|undefined)=>{setError('');setDraft(prev=>{const format={...prev.format};if(value===undefined)delete format[key];else Object.assign(format,{[key]:value});if(key==='paragraphStyle'&&value!=='quote')delete format.quoteStyle;return {...prev,format};});};
 const enabled=(key:keyof Format)=>draft.format[key]!==undefined,issue=naverFormatIssue(draft.format),quote=draft.format.paragraphStyle==='quote';
 const sizesValid=draft.format.fontSize===undefined||NAVER_FONT_SIZES.includes(draft.format.fontSize);
 return <Modal title="서식 프리셋 편집" onClose={onClose}><div className="dialog-body">
  <label className="stacked-label">프리셋 이름<input value={draft.name} maxLength={40} placeholder="예: 인용구 · 핵심 문장" onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
  <label className="stacked-label">짧은 설명<input value={draft.description} maxLength={100} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
  <p className="helper">변경할 속성만 체크해 주세요. 나머지는 현재 서식을 유지해요.</p>
  {issue&&<div role="status"><Notice tone="warning">{issue} 기존 설정은 저장하기 전까지 유지됩니다.</Notice></div>}
  <div className="preset-edit-fields">
   {quote&&<QuoteStylePicker value={resolveQuoteStyle(draft.format)} onChange={quoteStyle=>{setError('');setDraft(prev=>{const format={...prev.format,quoteStyle};delete format.align;return {...prev,format};});}}/>}
   <label><span><input type="checkbox" checked={enabled('fontSize')} onChange={e=>patch('fontSize',e.target.checked?16:undefined)}/>글자 크기</span><select aria-label="글자 크기 선택" disabled={!enabled('fontSize')} value={sizesValid?draft.format.fontSize??16:''} onChange={e=>patch('fontSize',Number(e.target.value))}><option disabled value="">지원 크기 선택</option>{NAVER_FONT_SIZES.map(size=><option key={size} value={size}>{size}</option>)}</select></label>
   <div className="preset-color-field"><label><input type="checkbox" checked={enabled('color')} onChange={e=>patch('color',e.target.checked?'#141414':undefined)}/>글자색</label><NaverColorPicker label="글자색" value={draft.format.color??'#141414'} disabled={!enabled('color')} onChange={value=>patch('color',value)}/></div>
   <label><span><input type="checkbox" checked={enabled('bold')} onChange={e=>patch('bold',e.target.checked?true:undefined)}/>굵게</span><select aria-label="굵게 선택" disabled={!enabled('bold')} value={draft.format.bold?'bold':'normal'} onChange={e=>patch('bold',e.target.value==='bold')}><option value="bold">굵게</option><option value="normal">보통</option></select></label>
   <div className="preset-color-field"><label><input type="checkbox" checked={enabled('background')} disabled={quote&&!enabled('background')} onChange={e=>patch('background',e.target.checked?'#c2f4db':undefined)}/>배경색</label><NaverColorPicker label="배경색" value={draft.format.background??'#c2f4db'} disabled={!enabled('background')||quote} onChange={value=>patch('background',value)}/></div>
   <label><span><input type="checkbox" checked={enabled('align')} disabled={quote&&draft.format.quoteStyle!==undefined&&!enabled('align')} onChange={e=>patch('align',e.target.checked?'left':undefined)}/>문단 정렬</span><select aria-label="문단 정렬 선택" disabled={!enabled('align')||quote&&draft.format.quoteStyle!==undefined} value={quote&&draft.format.quoteStyle!==undefined&&!enabled('align')?'native':quote&&draft.format.align==='right'?'':draft.format.align??'left'} onChange={e=>patch('align',e.target.value as Format['align'])}><option disabled value="">지원 정렬 선택</option>{quote&&draft.format.quoteStyle!==undefined&&<option value="native">모양 기본 정렬</option>}<option value="left">왼쪽</option><option value="center">가운데</option>{!quote&&<option value="right">오른쪽</option>}</select></label>
   <label><span><input type="checkbox" checked={enabled('paragraphStyle')} onChange={e=>patch('paragraphStyle',e.target.checked?'quote':undefined)}/>문단 스타일</span><select aria-label="문단 스타일 선택" disabled={!enabled('paragraphStyle')} value={draft.format.paragraphStyle??'body'} onChange={e=>patch('paragraphStyle',e.target.value as Format['paragraphStyle'])}><option value="body">일반 문단</option><option value="quote">인용구</option></select></label>
  </div><Notice>글자색과 배경색은 네이버 기본 팔레트에서 선택해요.</Notice>{error&&<Notice tone="warning">{error}</Notice>}
 </div><footer className="modal-footer">{onDelete&&<button className="text-btn danger" onClick={()=>void onDelete()}>프리셋 삭제</button>}<button className="secondary" onClick={onClose}>취소</button><button className="primary" disabled={saving||!!issue||!draft.name.trim()} onClick={async()=>{setSaving(true);try{assertNaverFormat(draft.format);await onSave(draft);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}}>프리셋 저장</button></footer></Modal>;
}
