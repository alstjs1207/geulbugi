import type { Post } from './types';
export function canonicalPost(input: string): {blogId: string;postId: string;url: string} {
 let url: URL; try { url = new URL(input.trim()); } catch { throw new Error('올바른 게시글 URL을 입력해 주세요.'); }
 if(url.protocol!=='https:' || !['blog.naver.com','m.blog.naver.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('HTTPS 네이버 블로그 게시글 URL만 등록할 수 있어요.');
 const parts=url.pathname.split('/').filter(Boolean);
 const blogId=(url.searchParams.get('blogId') ?? (parts[0]?.endsWith('.naver') ? '' : parts[0]) ?? '').toLowerCase();
 const postId=url.searchParams.get('logNo') ?? parts[1] ?? '';
 if(!/^[a-z0-9_-]{2,60}$/.test(blogId) || !/^\d{1,30}$/.test(postId)) throw new Error('블로그 주소가 아닌 개별 게시글 URL을 입력해 주세요.');
 return {blogId,postId,url:'https://blog.naver.com/'+blogId+'/'+postId};
}
export function normalizeBlog(input:string):string {
 if(!input.trim()) return '';
 let url:URL;try {url=new URL(input.trim());}catch{throw new Error('블로그 주소를 https://blog.naver.com/아이디 형식으로 입력해 주세요.');}
 if(url.protocol!=='https:'||!['blog.naver.com','m.blog.naver.com'].includes(url.hostname)||url.username||url.password||url.port) throw new Error('네이버 블로그 주소만 사용할 수 있어요.');
 const id=(url.searchParams.get('blogId')??url.pathname.split('/').filter(Boolean)[0]??'').toLowerCase();
 if(!/^[a-z0-9_-]{2,60}$/.test(id)) throw new Error('블로그 아이디를 확인해 주세요.');
 return 'https://blog.naver.com/'+id;
}
export function safeHref(input:string|undefined):string|undefined { if(!input)return;try {const u=new URL(input);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;} }
export function canonicalLinkedUrl(input:string|undefined):string|undefined {
 const safe=safeHref(input);if(!safe)return;
 try{return canonicalPost(safe.replace(/^http:/,'https:')).url;}catch{return safe;}
}
export function safeColor(value:unknown):value is string {return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
export function plainText(value:unknown,max=10000):string {if(typeof value!=='string')throw new Error('텍스트 자료 형식을 확인해 주세요.');return value.slice(0,max).replace(/\u0000/g,'');}
export function validatePost(value:unknown,ownBlogUrl=''):Post {
 if(!value||typeof value!=='object')throw new Error('게시글 자료 형식이 올바르지 않아요.');
 const p=value as Record<string,unknown>;const identity=canonicalPost(plainText(p.url,2048));
 if(ownBlogUrl&&normalizeBlog(ownBlogUrl)!=='https://blog.naver.com/'+identity.blogId)throw new Error('등록한 내 블로그의 글만 가져올 수 있어요.');
 const title=plainText(p.title,300).trim();if(!title)throw new Error('게시글 제목을 입력해 주세요.');
 const collectedAt=typeof p.collectedAt==='string'&&Number.isFinite(Date.parse(p.collectedAt))?new Date(p.collectedAt).toISOString():new Date().toISOString();
 const publishedAt=typeof p.publishedAt==='string'&&p.publishedAt&&Number.isFinite(Date.parse(p.publishedAt))?new Date(p.publishedAt).toISOString().slice(0,10):'';
 if(p.tags!==undefined&&(!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string')))throw new Error('태그는 문자열 목록이어야 해요.');
 return {...identity,title,tags:(p.tags as string[]??[]).slice(0,30).map(t=>plainText(t,60).replace(/^#/,'')),excerpt:plainText(p.excerpt??'',600),publishedAt,collectedAt};
}
export function upsertPosts(existing:Post[],incoming:Post[]):{posts:Post[];added:number;updated:number;skipped:number} {
 const map=new Map(existing.map(p=>[p.url,p]));let added=0,updated=0,skipped=0;
 for(const item of incoming){const p=validatePost(item);const prev=map.get(p.url);if(!prev){added++;map.set(p.url,p);}else if(Date.parse(p.collectedAt)>=Date.parse(prev.collectedAt)){updated++;map.set(p.url,p);}else skipped++;}
 return {posts:[...map.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.title.localeCompare(b.title)),added,updated,skipped};
}
