// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ShortcutPresets} from '../src/ui/ShortcutPresets';
import {defaultDatabase} from '../src/core/defaults';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function choose(slot:number,id:string){await act(async()=>{const select=host.querySelectorAll('select')[slot-1];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(select,id);select.dispatchEvent(new Event('change',{bubbles:true}));});}

describe('shortcut choices with delayed persistence',()=>{
 it('keeps the selected ID after React resets the controlled select while storage is pending',async()=>{
  const db=defaultDatabase(),pending:(()=>void)[]=[],stored={...db.settings.shortcutPresets};
  await act(async()=>root.render(<ShortcutPresets presets={db.presets} bindings={db.settings.shortcutPresets} onChange={(slot,id)=>pending.push(()=>{stored[slot]=id;})}/>));
  await choose(1,'emphasis');for(const save of pending)save();expect(stored['1']).toBe('emphasis');await act(async()=>root.render(<ShortcutPresets presets={db.presets} bindings={stored} onChange={()=>{}}/>));expect(host.querySelector('select')!.value).toBe('emphasis');
 });
 it('keeps rapid choices for different slots and supports disconnecting one slot',async()=>{
  const db=defaultDatabase(),pending:(()=>void)[]=[],stored={...db.settings.shortcutPresets};await act(async()=>root.render(<ShortcutPresets presets={db.presets} bindings={db.settings.shortcutPresets} onChange={(slot,id)=>pending.push(()=>{stored[slot]=id;})}/>));
  await choose(1,'emphasis');await choose(2,'body');await choose(4,'');for(const save of pending)save();expect(stored).toMatchObject({'1':'emphasis','2':'body','4':''});expect(host.querySelectorAll('select')).toHaveLength(8);
 });
});
