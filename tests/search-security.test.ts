import { describe,it,expect } from 'vitest';
import { canonicalPost,normalizeBlog,upsertPosts,validatePost } from '../src/core/security';
import { searchPosts,terms } from '../src/core/search';
import { demoPosts } from '../src/platform/demo';
describe('local search and URL identity',()=>{
 it('normalizes desktop, mobile and PostView URLs to one identity',()=>{expect(canonicalPost('https://m.blog.naver.com/example_blog/10001?tracking=x').url).toBe(demoPosts[0].url);expect(canonicalPost('https://blog.naver.com/PostView.naver?blogId=example_blog&logNo=10001&foo=x').url).toBe(demoPosts[0].url);});
 it.each(['javascript:alert(1)','https://evil.test/example_blog/10001','https://blog.naver.com@evil.test/example_blog/10001','http://blog.naver.com/example_blog/10001','https://blog.naver.com/example_blog','https://blog.naver.com:9999/example_blog/10001'])('rejects unsafe or incomplete URLs: %s',url=>expect(()=>canonicalPost(url)).toThrow());
 it('accepts a blog identifier and strips unrelated parameters',()=>expect(normalizeBlog('https://m.blog.naver.com/example_blog?tracking=x')).toBe('https://blog.naver.com/example_blog'));
 it('rejects another blog on registration',()=>expect(()=>validatePost(demoPosts[0],'https://blog.naver.com/another_blog')).toThrow());
 it('gives tags and titles greater weight than excerpts',()=>{const a={...demoPosts[0],title:'다른 제목',tags:[],excerpt:'숲길'},b={...demoPosts[1],title:'숲길 안내',tags:['숲길'],excerpt:''};expect(searchPosts([a,b],'숲길')[0].post.url).toBe(b.url);});
 it('ignores common stop words',()=>expect(terms('그리고 정말 너무 숲길에서 아이와')).toEqual(['숲길','아이']));
 it('uses only supplied local records and marks duplicate links',()=>{const hits=searchPosts([demoPosts[0]],'아이 숲길',['https://m.blog.naver.com/example_blog/10001']);expect(hits).toHaveLength(1);expect(hits[0].inserted).toBe(true);});
 it('does not overwrite a newer record with an older backup',()=>{const newer={...demoPosts[0],title:'최신 제목',collectedAt:'2026-10-06T12:00:00Z'};const result=upsertPosts([newer],[demoPosts[0]]);expect(result.posts).toHaveLength(1);expect(result.posts[0].title).toBe('최신 제목');expect(result.skipped).toBe(1);});
 it('updates a duplicate canonical URL',()=>{const incoming={...demoPosts[0],url:'https://m.blog.naver.com/example_blog/10001',title:'갱신',collectedAt:'2026-10-07T00:00:00Z'};const result=upsertPosts([demoPosts[0]],[incoming]);expect(result.posts).toHaveLength(1);expect(result.updated).toBe(1);expect(result.posts[0].title).toBe('갱신');});
});
