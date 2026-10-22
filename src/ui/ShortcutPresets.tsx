import type {Preset} from '../core/types';

export function ShortcutPresets({presets,bindings,onChange}:{presets:Preset[];bindings:Record<string,string>;onChange:(slot:string,presetId:string)=>void}){
 return <div className="shortcut-list">{Array.from({length:8},(_,i)=>String(i+1)).map(slot=><label key={slot}><span>단축키 {slot}</span><select value={bindings[slot]??''} onChange={event=>onChange(slot,event.currentTarget.value)}><option value="">연결 안 함</option>{presets.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>)}</div>;
}
