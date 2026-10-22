// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {WindowedBlocks} from '../src/ui/components';
import type {Block} from '../src/core/types';
it('renders a bounded list and reveals the remembered destination when requested',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const blocks:Block[]=Array.from({length:1000},(_,i)=>({id:'paragraph-'+i,kind:'paragraph',text:'문단 내용 '+i,runs:[{text:'문단 내용 '+i,marks:{}}]}));
 const ordinal=new Map(blocks.map((b,i)=>[b.id,i+1]));
 try{
  await act(async()=>root.render(<WindowedBlocks blocks={blocks} selected="paragraph-900" onSelect={()=>{}} ordinal={ordinal} focusToken={0}/>));
  expect(host.querySelectorAll('button').length).toBeLessThan(30);expect(host.querySelector('.chosen')?.textContent).toContain('문단 내용 900');
  const viewport=host.querySelector<HTMLElement>('.windowed')!;await act(async()=>{viewport.scrollTop=0;viewport.dispatchEvent(new Event('scroll',{bubbles:true}));});
  expect(host.querySelector('.chosen')).toBeNull();
  await act(async()=>root.render(<WindowedBlocks blocks={blocks} selected="paragraph-900" onSelect={()=>{}} ordinal={ordinal} focusToken={1}/>));
  expect(host.querySelector('.chosen')?.textContent).toContain('문단 내용 900');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
