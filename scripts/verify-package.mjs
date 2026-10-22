import { readFile, access, stat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {inflateSync} from 'node:zlib';
const root=resolve('dist'),manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const fail=message=>{throw new Error(message);};
if(manifest.manifest_version!==3)fail('Manifest V3 required');
if(JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(['sidePanel','storage']))fail('Unexpected or missing permission');
if(JSON.stringify([...manifest.host_permissions].sort())!==JSON.stringify(['https://blog.naver.com/*','https://m.blog.naver.com/*']))fail('Unexpected host permission');
if(manifest.commands['apply-preset-4']?.description!=='서식 단축키 4 적용')fail('Quote shortcut slot missing');
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.version!==manifest.version)fail('Package and manifest versions differ');
if(manifest.name!=='글부기'||manifest.action.default_title!=='글부기 열기')fail('Product branding differs from the approved name');
if(!manifest.description||manifest.description.length>132)fail('Invalid store description');
if(manifest.content_scripts.some(script=>script.matches.some(match=>match!=='https://blog.naver.com/*')))fail('Unexpected content script host');
const files=[manifest.background.service_worker,manifest.side_panel.default_path,manifest.options_page,...manifest.content_scripts.flatMap(s=>s.js),...Object.values(manifest.icons),'privacy.html','THIRD_PARTY_NOTICES.txt'];
for(const file of files){if(file.startsWith('/')||file.includes('..'))fail('Unsafe package path');await access(resolve(root,file));}
for(const file of ['sidepanel.html','options.html']){
 const html=await readFile(resolve(root,file),'utf8');
 if(/<script[^>]*>[^<]+<\/script>/i.test(html))fail('Inline script is not allowed by extension CSP');
 for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)){const asset=match[1].replace(/^\//,'');await access(resolve(root,asset));}
}
const policy=await readFile(resolve(root,'privacy.html'),'utf8');
if(!policy.includes('chrome.storage.local')||!policy.includes('삭제')||!policy.includes('네이버'))fail('Privacy disclosure is incomplete');
if(/<script|<iframe|<form|\b(?:src|href)=["'](?:http:|javascript:)/i.test(policy))fail('Active or insecure privacy page');
const notices=await readFile(resolve(root,'THIRD_PARTY_NOTICES.txt'),'utf8');
for(const name of ['react','react-dom','scheduler','lucide-react'])if(!notices.includes(name+' '))fail('Missing third-party notice: '+name);
// Confirm the 128px icon has real alpha padding and 96px artwork, not an
// opaque 128px square that violates the store's icon sizing guidance.
const icon=await readFile(resolve(root,manifest.icons['128']));
if(icon.readUInt32BE(16)!==128||icon.readUInt32BE(20)!==128||icon[25]!==6)fail('128px RGBA icon required');
const chunks=[];for(let at=8;at<icon.length;){const size=icon.readUInt32BE(at);if(icon.toString('ascii',at+4,at+8)==='IDAT')chunks.push(icon.subarray(at+8,at+8+size));at+=12+size;}
// Browser-exported PNGs can use all standard row filters. Decode them before
// inspecting alpha rather than assuming the old generated icon's filter 0.
const encoded=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(128*128*4),stride=128*4;
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<128;y++){
 const filter=encoded[y*(stride+1)];if(filter>4)fail('Unsupported icon PNG filter');
 for(let x=0;x<stride;x++){
  const at=y*stride+x,left=x>=4?pixels[at-4]:0,up=y?pixels[at-stride]:0,upperLeft=y&&x>=4?pixels[at-stride-4]:0;
  const predictor=filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0;
  pixels[at]=(encoded[y*(stride+1)+1+x]+predictor)&255;
 }
}
const alpha=(x,y)=>pixels[(y*128+x)*4+3];
if(alpha(0,0)!==0||alpha(15,64)!==0||alpha(16,64)!==255||alpha(111,64)!==255||alpha(112,64)!==0)fail('Icon artwork/padding mismatch');
if(!icon.equals(await readFile('public/icons/128.png')))fail('Packaged icon differs from the approved brand asset');
async function walk(directory){return (await Promise.all((await readdir(directory,{withFileTypes:true})).map(async entry=>{const path=resolve(directory,entry.name);return entry.isDirectory()?walk(path):[path];}))).flat();}
const allFiles=await walk(root);
for(const path of allFiles){
 if(/(?:\.map$|\.env(?:\.|$)|\.DS_Store$)/.test(path))fail('Development/private file in package: '+path);
 if(/\.(?:js|html|css|json|txt)$/.test(path)){
  const text=await readFile(path,'utf8');
  if(/\/Users\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))fail('Private development data in package: '+path);
 }
}
const bytes=(await Promise.all(allFiles.map(f=>stat(f)))).reduce((sum,item)=>sum+item.size,0);
console.log(JSON.stringify({manifestVersion:3,version:manifest.version,requiredFiles:files.length,totalFiles:allFiles.length,bytes,permissions:manifest.permissions,hosts:manifest.host_permissions,privacyPolicy:true,thirdPartyNotices:true,iconPadding:16},null,2));
