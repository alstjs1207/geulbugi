import type {BreakRules} from '../core/types';

export function RulesEditor({rules,onChange,canReflow=true}:{rules:BreakRules;onChange:(patch:Partial<BreakRules>)=>void;canReflow?:boolean}){
 const patch=(value:Partial<BreakRules>)=>onChange(value);
 return <div className="rules-form">
  <div className="field-row"><label>적용 범위</label><div className="segmented"><button className={rules.scope==='selection'?'active':''} onClick={()=>patch({scope:'selection'})}>선택 영역</button><button className={rules.scope==='body'?'active':''} onClick={()=>patch({scope:'body',reflow:false,preserveExisting:true})}>일반 본문</button></div></div>
  <div className="field-row"><label>문장마다 나누기</label><div className="segmented">{([1,2] as const).map(n=><button key={n} className={rules.sentences===n?'active':''} onClick={()=>patch({sentences:n})}>{n}문장</button>)}</div></div>
  <div className="field-row"><label htmlFor="long-mode">긴 문장 나누기</label><select id="long-mode" value={rules.longMode??'meaning'} onChange={e=>patch({longMode:e.target.value as BreakRules['longMode']})}><option value="meaning">문장·구절 우선</option><option value="length">길이 우선</option></select></div>
  <div className="field-row"><label htmlFor="long-length">긴 문장 기준</label><div><input id="long-length" type="number" min="10" max="120" value={rules.longLength} onChange={e=>{const n=Number(e.target.value);if(n>=10&&n<=120)patch({longLength:n});}}/> 자<small>{rules.longMode==='length'?'기준 길이 근처의 공백에서 나눠요.':'길이는 참고값이에요. 쉼표·연결 구절에서 나누고, 안전한 경계가 없으면 문장을 유지해요.'}</small></div></div>
  <div className="field-row"><label htmlFor="blank-lines">문단 사이 빈 줄</label><select id="blank-lines" value={rules.blankLines} onChange={e=>patch({blankLines:Number(e.target.value) as 0|1|2})}>{[0,1,2].map(n=><option key={n} value={n}>{n}줄</option>)}</select></div>
  <label className="toggle-row"><span>기존 줄바꿈 보존</span><input type="checkbox" checked={rules.preserveExisting} onChange={e=>patch(e.target.checked?{preserveExisting:true,reflow:false}:{preserveExisting:false})}/><i/></label>
  <label className="toggle-row"><span>선택 범위 다시 정리</span><input type="checkbox" disabled={rules.scope!=='selection'||!canReflow&&!rules.reflow} checked={rules.reflow} onChange={e=>patch({reflow:e.target.checked,preserveExisting:!e.target.checked})}/><i/></label>
  {!canReflow&&<p className="helper">줄 합치기는 지원하지 않아요. 기존 줄을 유지하면서 새 줄바꿈을 추가해요.</p>}
 </div>;
}
