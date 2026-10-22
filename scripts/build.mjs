import { build as buildVite } from 'vite';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
await buildVite();
// Retain the complete redistribution notices in every installable package.
const {readFile}=await import('node:fs/promises');
const notices=[];
for(const name of ['react','react-dom','scheduler','lucide-react']){
 const directory=new URL('../node_modules/'+name+'/',import.meta.url);
 const info=JSON.parse(await readFile(new URL('package.json',directory),'utf8'));
 notices.push(`${name} ${info.version}\n${await readFile(new URL('LICENSE',directory),'utf8')}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt',notices.join('\n\n'+'='.repeat(72)+'\n\n'));
for (const entry of ['background','content']) await build({entryPoints:[`src/${entry}.ts`],outfile:`dist/${entry}.js`,bundle:true,format:entry==='background'?'esm':'iife',target:'chrome116',minify:true});
// Approved, versioned icons are copied from public/icons by Vite.
console.log('Load unpacked extension: dist/');
