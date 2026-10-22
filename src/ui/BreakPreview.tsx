import {useState} from 'react';
import type {BreakChange,BreakRules,Run} from '../core/types';
import {RichText} from './components';
import {wrapRuns} from '../core/linebreak';

// A marker is decoration, not document text; copying retains the exact text.
function BreakText({runs}:{runs:Run[]}){
 return <>{runs.map((run,index)=><span key={index}>{run.text.split('\n').map((text,part,parts)=><span key={part}><RichText runs={[{...run,text}]}/>{part<parts.length-1&&<><span className="break-marker" aria-hidden="true" title="실제 줄바꿈"/>{'\n'}</>}</span>)}</span>)}</>;
}
export function BreakPreview({changes,selected,onToggle}:{changes:BreakChange[];selected:Set<string>;onToggle:(blockId:string)=>void}){
 const [mobile,setMobile]=useState(false);
 return <><div className="break-preview-view" role="group" aria-label="미리보기 표시 방식"><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)}>줄바꿈 위치</button><button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)}>모바일 참고</button><small>{mobile?'화면 폭에 따른 자동 줄바꿈을 함께 보여요.':'가로로 스크롤하면 문장 전체를 볼 수 있어요.'}</small></div><div className={'compare-columns break-compare '+(mobile?'mobile-view':'position-view')}>{(['before','after'] as const).map(side=><section key={side}><header><h3>{side==='before'?'변경 전':'변경 후'}</h3><small>{mobile?'모바일 참고 화면 · 최대 375px':'실제 줄바꿈 위치 · ↵'}</small></header><div className="mobile-preview">{changes.map(change=>{
 const included=selected.has(change.blockId),before=change.paragraphBefore??change.before,after=change.paragraphAfter??change.after;
 return <div className={'break-preview-item '+(side==='after'&&included?'included':'')} key={change.blockId}><div className="break-preview-action">{side==='after'?<label className="include-change"><input type="checkbox" checked={included} onChange={()=>onToggle(change.blockId)}/>이 문단 적용</label>:<span aria-hidden="true">원문</span>}</div><div className="break-preview-scroll"><div className="break-preview-copy" style={{textAlign:change.align}}><BreakText runs={side==='after'&&included?after:before}/></div></div></div>;
 })}</div></section>)}</div></>;
}

export function BreakExample({rules}:{rules:BreakRules}){
 const source=[{text:'주말에는 아이와 함께 숲길을 걸었어요. 바람이 선선해서 산책하기 좋았고, 중간에 쉬어 갈 벤치도 많았어요.',marks:{}}];
 const {runs}=wrapRuns(source,rules);
 return <><div className="break-example"><small>현재 설정 적용 예시</small><div className="break-preview-scroll"><p className="break-preview-copy"><BreakText runs={runs}/></p></div></div><p className="helper">예시 문장이에요. 내 글의 실제 줄바꿈 위치는 변경 전후 미리보기에서 ↵ 표시로 확인해 주세요.</p></>;
}
