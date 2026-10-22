import type {ReactNode} from 'react';
import type {QuoteStyle} from '../core/types';
import {NAVER_QUOTE_STYLES} from '../core/naver-format-options';

export function QuotePreview({quoteStyle,compact=false,children}:{quoteStyle:string;compact?:boolean;children:ReactNode}){
 return <div className={'quote-visual quote-'+quoteStyle+(compact?' compact':'')} aria-hidden={compact||undefined}><div className="quote-content">{children}</div></div>;
}

export function QuoteStylePicker({value,onChange,disabled=false,compact=false}:{value:string;onChange:(value:QuoteStyle)=>void;disabled?:boolean;compact?:boolean}){
 return <fieldset className="quote-style-field"><legend>인용구 모양</legend><div className="quote-style-grid" role="group" aria-label="인용구 모양">
  {NAVER_QUOTE_STYLES.map(option=><button type="button" key={option.value} disabled={disabled} aria-label={option.label+' · '+option.name} aria-pressed={option.value===value} onClick={()=>onChange(option.value)}><QuotePreview quoteStyle={option.value} compact>인용 문장</QuotePreview><span className="quote-style-number">{compact?option.label.replace('인용구 ',''):option.label}</span><span className="quote-style-name">{option.name}</span></button>)}
 </div><p className="helper">모양을 고르면 해당 모양의 기본 정렬을 사용해요.</p></fieldset>;
}
