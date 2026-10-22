import {it,expect} from 'vitest';
import {defaultDatabase} from '../src/core/defaults';
import {exportBackup,parseBackup} from '../src/core/backup';
it('audit: can restore a backup exported after 101 valid presets',()=>{
 const db=defaultDatabase();
 db.presets=Array.from({length:101},(_,i)=>({...db.presets[0],id:'custom-'+i,name:'사용자 프리셋 '+i}));
 const raw=JSON.stringify(exportBackup(db,{presets:true,rules:true,posts:true}));
 expect(new TextEncoder().encode(raw).length).toBeLessThan(20*1024*1024);
 expect(()=>parseBackup(raw)).not.toThrow();
});
