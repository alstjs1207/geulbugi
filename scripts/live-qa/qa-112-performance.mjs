// Generate an isolated production-mode browser benchmark. No Naver requests.
// node scripts/live-qa/qa-112-performance.mjs
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd(), out = path.join(root, 'artifacts/qa-112-performance');
await mkdir(out, {recursive: true});
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {App} from './src/ui/App';
import {EditorReader} from './src/editor/reader';
import {NativeAdapter} from './src/editor/native-adapter';
import {defaultDatabase} from './src/core/defaults';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const listeners=new Set();
window.chrome={runtime:{id:'benchmark',getURL:p=>p,getManifest:()=>({version:'1.1.2'}),onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}},windows:{getCurrent:async()=>({id:77})},storage:{local:{get:async()=>({})},onChanged:{addListener:()=>{},removeListener:()=>{}}}};
const fixture=document.querySelector('#fixture'),ui=document.querySelector('#ui');
const paragraph=i=>'검수 '+i+' 문단입니다. 빠르게 글자를 선택하고 서식을 적용한 다음 계속 작성합니다.';
function setup(n){fixture.innerHTML='<div class="se-editor"><div class="se-main-container"><div contenteditable="true">'+Array.from({length:n},(_,i)=>'<p id="SE-'+i+'" class="se-text-paragraph"><span>'+paragraph(i)+'</span></p>').join('')+'</div></div></div><button aria-label="굵기 적용">굵게</button>';}
function choose(){const span=fixture.querySelector('p span'),range=document.createRange();range.selectNodeContents(span);const s=window.getSelection();s.removeAllRanges();s.addRange(range);}
function summary(values){const a=[...values].sort((a,b)=>a-b);return {medianMs:+a[Math.floor(a.length/2)].toFixed(3),p95Ms:+a[Math.min(a.length-1,Math.floor(a.length*.95))].toFixed(3)};}
window.bench={
 async reader(n){setup(n);const reader=new EditorReader();let reads=0,changes=0,styles=0;const original=reader.read.bind(reader),css=window.getComputedStyle;reader.read=()=>{reads++;return original();};reader.onChange=()=>changes++;
  choose();reader.captureSelection();await delay(80);const readTimes=[];for(let i=0;i<15;i++){const t=performance.now();reader.read();readTimes.push(performance.now()-t);}window.getComputedStyle=(...args)=>{styles++;return css(...args);};reader.read();window.getComputedStyle=css;
  reads=changes=0;const captures=[];for(let i=0;i<15;i++){const t=performance.now();reader.captureSelection();captures.push(performance.now()-t);}const result={paragraphs:n,read:summary(readTimes),capture:summary(captures),readsFor15IdenticalSelections:reads,notificationsFor15IdenticalSelections:changes,computedStylesPerRead:styles};reader.dispose();fixture.innerHTML='';return result;
 },
 async nativeCaret(n,chars){setup(n);window.scrollTo(0,0);const first=fixture.querySelector('p span'),unit='선택 위치와 입력 속도를 확인합니다. ';first.textContent=unit.repeat(Math.ceil(chars/unit.length)).slice(0,chars);const node=first.firstChild,offset=Math.floor(node.textContent.length/2),range=document.createRange();range.setStart(node,offset);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);const rect=range.getClientRects()[0];
  const overlay=document.createElement('div');overlay.className='se-selection';overlay.style.cssText='position:fixed;left:0;top:0';const caret=document.createElement('div');caret.className='se-caret';caret.style.cssText='position:absolute;left:'+rect.left+'px;top:'+rect.top+'px;height:'+rect.height+'px';overlay.append(caret);fixture.append(overlay);
  const frame=document.createElement('iframe');frame.id='input_buffer_perf';frame.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';fixture.append(frame);frame.contentDocument.body.setAttribute('contenteditable','true');const nativeRange=frame.contentDocument.createRange();nativeRange.selectNodeContents(frame.contentDocument.body);nativeRange.collapse(true);frame.contentWindow.getSelection().removeAllRanges();frame.contentWindow.getSelection().addRange(nativeRange);frame.contentDocument.body.focus();
  const reader=new EditorReader();reader.captureSelection();await delay(80);let reads=0;const original=reader.read.bind(reader);reader.read=()=>{reads++;return original();};const values=[];for(let i=0;i<7;i++){const t=performance.now();reader.captureSelection();values.push(performance.now()-t);}const selected=reader.read().selection;const result={paragraphs:n,paragraphCharacters:node.textContent.length,expectedOffset:offset,actualOffset:selected?.start,valid:selected?.valid,readsFor7Captures:reads-1,...summary(values)};reader.dispose();fixture.innerHTML='';return result;
 },
 async format(n,secondAfterMs){setup(n);const adapter=new NativeAdapter(),reader=adapter.reader;let reads=0;const original=reader.read.bind(reader);reader.read=()=>{reads++;return original();};choose();reader.captureSelection();await delay(80);
  fixture.querySelector('button').onclick=()=>{const span=fixture.querySelector('p span');span.style.fontWeight=span.style.fontWeight==='700'?'400':'700';};reads=0;const start=performance.now(),first=adapter.handle({type:'format',preset:{id:'perf-bold',name:'굵게',description:'',format:{bold:true}}});let second;if(secondAfterMs!==undefined){await delay(secondAfterMs);second=await adapter.handle({type:'format',preset:{id:'perf-off',name:'굵게 해제',description:'',format:{bold:false}}});}const r=await first;const result={paragraphs:n,wallMs:+(performance.now()-start).toFixed(2),reads,ok:r.ok,error:r.error,...(second?{secondAfterMs,secondOk:second.ok,secondError:second.error}:{})};reader.dispose();fixture.innerHTML='';return result;
 },
 async panel(variant,n,posts=0,turns=40){window.__perfVariant=variant;window.__perfDb=defaultDatabase();window.__perfDb.settings.blogUrl='https://blog.naver.com/example_blog';window.__perfDb.posts=Array.from({length:posts},(_,i)=>({blogId:'example_blog',postId:String(10000+i),url:'https://blog.naver.com/example_blog/'+(10000+i),title:'저장한 글 '+i,tags:['검수'],excerpt:'저장한 자료입니다.',publishedAt:'2026-11-10',collectedAt:'2026-11-10T00:00:00Z'}));
  const blocks=Array.from({length:n},(_,i)=>({id:'b'+i,kind:'paragraph',text:paragraph(i),runs:[{text:paragraph(i),marks:{fontSize:16}}]}));
  const snap={sessionId:'perf',documentKey:'perf',revision:'same-document',adapterSignature:'benchmark',title:'입력 지연 검수',url:'https://blog.naver.com/PostWriteForm.naver',editable:true,blocks,linkedUrls:[],uploadBusy:false,canUndo:false};
  window.__perfSnapshot={...snap,selection:{blockId:'b0',endBlockId:'b0',start:0,end:10,text:blocks[0].text.slice(0,10),signature:'test',valid:true,collapsed:false}};
  const root=createRoot(ui);flushSync(()=>root.render(React.createElement(App)));await delay(10);const times=[];
  for(let i=0;i<turns+10;i++){const snapshot={...window.__perfSnapshot,selection:{...window.__perfSnapshot.selection,start:i%5,end:10+i%5,text:paragraph(0).slice(i%5,10+i%5)}};const t=performance.now();flushSync(()=>{for(const fn of listeners)fn({type:'SHORTCUT_RESULT',response:{ok:true,snapshot}});});if(i>=10)times.push(performance.now()-t);await delay(0);}
  const result={variant,paragraphs:n,savedPosts:posts,turns,...summary(times),previewPresent:!!ui.querySelector('.preset-preview'),hiddenPostsPresent:!!ui.querySelector('.post-source')};root.unmount();await delay(0);return result;
 }
};
document.querySelector('#status').textContent='ready';
`;
await build({stdin:{contents:source,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},outfile:path.join(out,'benchmark.js'),plugins:[{
 name:'isolated-benchmark',setup(builder){
  builder.onResolve({filter:/platform\/bridge$/},()=>({path:'bridge',namespace:'perf'}));
  builder.onResolve({filter:/platform\/storage$/},()=>({path:'storage',namespace:'perf'}));
  builder.onLoad({filter:/.*/,namespace:'perf'},args=>({contents:args.path==='bridge'
   ? 'export const editorRequest=async()=>({ok:true,snapshot:window.__perfSnapshot});export const loadBlogCategories=async()=>[];export const loadRecentBlog=async()=>({posts:[]});export const searchOwnBlog=async()=>({posts:[]});export const capturePost=async()=>{};export const fetchPost=async()=>{};export const openShortcuts=async()=>{};export const openExtensionManager=async()=>{};export const prepareRecovery=async()=>{};export const reloadAfterSave=async()=>{};'
   : 'export const STORAGE_KEY="naver-blog-helper:v1";export const isExtension=()=>true;export const loadDatabase=async()=>window.__perfDb;export const saveDatabase=async()=>{};export const saveBlogAddress=async()=>{};',loader:'js'}));
  builder.onLoad({filter:/src\/ui\/App\.tsx$/},async args=>{
   let text=await readFile(args.path,'utf8');
   text=text.replace(/<div className="preset-preview">.*?<\/div>/,m=>'{globalThis.__perfVariant!=="no-preview"&&'+m+'}');
   text=text.replace(/<div hidden=\{tab!=='posts'\}>.*?<\/div>/,m=>'{globalThis.__perfVariant!=="no-hidden-panels"&&'+m+'}');
   text=text.replace(/<div hidden=\{tab!=='schedule'\}>.*?<\/div>/,m=>'{globalThis.__perfVariant!=="no-hidden-panels"&&'+m+'}');
   return {contents:text,loader:'tsx',resolveDir:path.dirname(args.path)};
  });
 }
}]});
await writeFile(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>글부기 성능 진단</title><link rel="stylesheet" href="../../src/ui/styles.css"><style>p{font:16px sans-serif;line-height:24px}#ui{width:400px}#fixture{width:700px}</style><p id="status">loading</p><div id="fixture"></div><div id="ui"></div><script src="benchmark.js"></script>');
console.log(path.join(out,'index.html'));
