import type { Post, SearchHit } from './types';
import { canonicalPost } from './security';
const STOP=new Set(['그리고','그래서','하지만','또한','정말','너무','아주','오늘','이번','저희','우리','여러분','합니다','있어요','있습니다','했어요','때문','대한','통해','이렇게','그렇게','것입니다','사진','기록','블로그','네이버','내용']);
export function terms(text:string):string[] {
 const raw=text.normalize('NFKC').toLocaleLowerCase('ko-KR').match(/[\p{L}\p{N}]+/gu)??[];
 return raw.map(w=>/^[가-힣]+$/.test(w)&&w.length>2?w.replace(/(에서는|으로는|에서|에게|으로|처럼|까지|부터|에는|은|는|이|가|을|를|와|과|도|의)$/u,''):w).filter(w=>Array.from(w).length>=2&&!STOP.has(w)&&!/^\d+$/.test(w));
}
export function extractedKeywords(title:string,body:string):string[] {const map=new Map<string,number>();for(const [text,weight] of [[title,5],[body.slice(0,12000),1]] as const)for(const term of terms(text))map.set(term,(map.get(term)??0)+weight);return [...map].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([term])=>term);}
export function searchPosts(posts:Post[],query:string,linkedUrls:string[]=[]):SearchHit[] {
 const keywords=[...new Set(terms(query))].slice(0,40);if(!keywords.length)return [];
 const links=new Set(linkedUrls.flatMap(url=>{try{return [canonicalPost(url).url];}catch{return [url];}}));
 return posts.map(post=>{
  const title=new Set(terms(post.title)),tags=new Set(terms(post.tags.join(' '))),excerpt=new Set(terms(post.excerpt));
  const matched=keywords.filter(k=>title.has(k)||tags.has(k)||excerpt.has(k));
  let score=matched.reduce((sum,k)=>sum+(title.has(k)?5:0)+(tags.has(k)?7:0)+(excerpt.has(k)?1:0),0);
  if(post.title.toLowerCase().includes(query.trim().toLowerCase())&&query.trim().length>1)score+=8;
  return {post,score,keywords:matched,inserted:links.has(post.url)};
 }).filter(h=>h.score>0).sort((a,b)=>b.score-a.score||b.post.publishedAt.localeCompare(a.post.publishedAt)||a.post.url.localeCompare(b.post.url));
}
