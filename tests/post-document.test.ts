// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from 'vitest';
import { readPostDocument } from '../src/core/post-document';
import { fetchPost } from '../src/platform/bridge';
const identity={blogId:'example_blog',postId:'10001',url:'https://blog.naver.com/example_blog/10001'};
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');

describe('published post metadata',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('reads body text inside the viewer layout table but excludes article tables and captions',()=>{
  const doc=parse(`<meta property="og:title" content="원문 제목"><table class="post-body"><tr><td><div class="se-main-container"><div class="se-documentTitle"><p class="se-text-paragraph">중복 제목</p></div><p class="se-text-paragraph">첫 본문입니다.</p><p class="se-text-paragraph">\u200b</p><p class="se-text-paragraph">두 번째 <b>본문</b>입니다.</p><div class="se-table"><p class="se-text-paragraph">표 안의 값</p></div><div class="se-module-image-caption"><p class="se-text-paragraph">사진 설명</p></div></div></td></tr></table><p>다른 글의 본문</p>`);
  expect(readPostDocument(doc,identity).excerpt).toBe('첫 본문입니다. 두 번째 본문입니다.');
 });
 it('captures only the current article tag list, excluding edit controls and duplicate tags',()=>{
  const doc=parse(`<meta property="og:title" content="제목"><div id="tagList_10001"><a class="itemTagfont"><span>#연애심리</span><i></i></a><a class="itemTagfont">#작은부탁</a><a class="itemTagfont">#작은부탁</a><a class="btn">태그수정</a></div><div id="tagList_10002"><a class="itemTagfont">#다른글</a></div><div class="tag"><a>다른태그</a></div>`);
  expect(readPostDocument(doc,identity).tags).toEqual(['연애심리','작은부탁']);
 });
 it('reads the title text inside a native title component without category, author or menu labels',()=>{
  const doc=parse('<div class="se-documentTitle"><a>건강심리</a><div class="se-title-text"><p class="se-text-paragraph">원문 제목</p></div><span>작성자</span><span class="se_publishDate">4시간 전</span><div>URL 복사 통계 수정하기</div></div>');
  expect(readPostDocument(doc,identity).title).toBe('원문 제목');
 });
 it('does not use dates from other posts in the viewer sidebar',()=>{
  const doc=parse('<meta property="og:title" content="제목"><table><tr><td class="date">2026. 7. 27.</td></tr></table><div class="se-documentTitle"><span class="se_publishDate">4시간 전</span></div>');
  expect(readPostDocument(doc,identity).publishedAt).toBe('');
 });
 it('removes script and UI text from excerpts without modifying the source document',()=>{
  const doc=parse(`<meta property="og:title" content="제목"><div class="se-main-container"><p class="se-text-paragraph">본문<script>privateValue</script><button>도구 안내</button> 문장입니다.</p></div>`),before=doc.documentElement.outerHTML;
  expect(readPostDocument(doc,identity).excerpt).toBe('본문 문장입니다.');
  expect(doc.documentElement.outerHTML).toBe(before);
 });
 it.each(['<span class="se_publishDate">2026. 10. 7. 08:00</span>','<time datetime="2026-10-07T08:00:00+09:00">4시간 전</time>'])('normalizes an absolute publication date: %s',date=>{
  expect(readPostDocument(parse(`<meta property="og:title" content="제목">${date}`),identity).publishedAt).toBe('2026-10-07');
 });
 it.each(['4시간 전','2026. 2. 30.'])('does not invent a date for a relative or invalid value: %s',date=>{
  expect(readPostDocument(parse(`<meta property="og:title" content="제목"><span class="se_publishDate">${date}</span>`),identity).publishedAt).toBe('');
 });
 it('uses an absolute metadata date when the visible date is relative',()=>{
  const doc=parse('<meta property="og:title" content="제목"><meta property="article:published_time" content="2026-10-07T08:00:00+09:00"><span class="se_publishDate">4시간 전</span>');
  expect(readPostDocument(doc,identity).publishedAt).toBe('2026-10-07');
 });
 it('supports legacy article paragraphs and limits the saved excerpt',()=>{
  const doc=parse(`<h2 class="htitle">  원문 제목 </h2><div class="post-view"><p>${'긴 본문 '.repeat(100)}</p></div><div class="post_tag"><a>#태그</a></div>`),post=readPostDocument(doc,identity);
  expect(post.title).toBe('원문 제목');expect(post.excerpt).toHaveLength(400);expect(post.tags).toEqual(['태그']);
 });
 it('shares the parser with URL reading after following the matching article iframe',async()=>{
  const sendMessage=vi.fn().mockResolvedValueOnce({ok:true,html:'<iframe id="mainFrame" src="/PostView.naver?blogId=example_blog&logNo=10001"></iframe>'}).mockResolvedValueOnce({ok:true,html:'<meta property="og:title" content="수집한 제목"><table class="post-body"><tr><td><div class="se-main-container"><p class="se-text-paragraph">수집한 발췌입니다.</p></div></td></tr></table><div id="tagList_10001"><a class="itemTagfont">#태그</a></div>'});
  vi.stubGlobal('chrome',{runtime:{id:'own-extension',sendMessage}});
  const post=await fetchPost(identity.url,'https://blog.naver.com/example_blog');
  expect(post).toMatchObject({...identity,title:'수집한 제목',excerpt:'수집한 발췌입니다.',tags:['태그']});
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(sendMessage.mock.calls[1][0].url).toBe('https://blog.naver.com/PostView.naver?blogId=example_blog&logNo=10001');
 });
});
