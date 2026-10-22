import type { Post } from './types';
import { canonicalPost, normalizeBlog, validatePost } from './security';

export const BLOG_SEARCH_QUERY_LIMIT = 120;
export type BlogSearchRequest = { blogUrl: string; query: string; page: number };
export type BlogSearchResult = BlogSearchRequest & { posts: Post[]; total: number; hasMore: boolean };

export function normalizeBlogSearchRequest(value: { blogUrl: unknown; query: unknown; page?: unknown }): BlogSearchRequest {
 if (typeof value.blogUrl !== 'string' || !value.blogUrl.trim()) throw new Error('내 블로그 주소를 먼저 설정해 주세요.');
 const blogUrl = normalizeBlog(value.blogUrl);
 if (typeof value.query !== 'string') throw new Error('검색어를 입력해 주세요.');
 const query = value.query.replace(/\s+/gu, ' ').trim();
 if (!query) throw new Error('검색어를 입력해 주세요.');
 if (query.length > BLOG_SEARCH_QUERY_LIMIT || /[\u0000-\u0008\u000e-\u001f\u007f]/u.test(query)) throw new Error('검색어는 120자 이하로 입력해 주세요.');
 const page = value.page ?? 1;
 if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 1000) throw new Error('검색 페이지를 확인해 주세요.');
 return { blogUrl, query, page };
}

export function blogSearchUrl(request: BlogSearchRequest): string {
 const { blogUrl, query, page } = normalizeBlogSearchRequest(request);
 const url = new URL('https://blog.naver.com/PostSearchList.naver');
 url.search = new URLSearchParams({ blogId: blogUrl.split('/').at(-1)!, categoryNo: '0', SearchText: query, orderBy: 'sim', range: 'all', cpage: String(page) }).toString();
 return url.href;
}

export function assertBlogSearchUrl(input: string, request: BlogSearchRequest): void {
 const url = new URL(input), expected = new URL(blogSearchUrl(request));
 if (url.origin !== expected.origin || url.username || url.password || url.pathname !== expected.pathname ||
     url.searchParams.get('blogId') !== expected.searchParams.get('blogId') || url.searchParams.get('SearchText') !== request.query ||
     Number(url.searchParams.get('cpage') ?? '1') !== request.page) {
  throw new Error('내 블로그 검색 결과를 확인하지 못했어요. 다시 검색해 주세요.');
 }
}

function text(node: Element | null): string {
 if (!node) return '';
 const copy = node.cloneNode(true) as Element;
 copy.querySelectorAll('script,style,noscript').forEach(element => element.remove());
 return (copy.textContent ?? '').replace(/[\u200b\ufeff]/gu, '').replace(/\s+/gu, ' ').trim();
}

function dateOnly(value: string): string {
 const match = value.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/u);
 if (!match) return '';
 const date = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
 const parsed = new Date(date + 'T00:00:00Z');
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

/** Parse the public in-blog search page; never run its scripts or save posts. */
export function readBlogSearchDocument(doc: Document, input: BlogSearchRequest): BlogSearchResult {
 const request = normalizeBlogSearchRequest(input);
 const ownId = request.blogUrl.split('/').at(-1)!;
 const declaredId = doc.querySelector<HTMLInputElement>('form[action*="PostSearchList.naver"] input[name="blogId"]')?.value;
 if (declaredId && declaredId.toLowerCase() !== ownId) throw new Error('다른 블로그의 검색 결과는 가져올 수 없어요.');
 const count = [...doc.querySelectorAll('td.c.b')].map(text).map(value => value.match(/^검색결과\s*([\d,]+)건$/u)).find(Boolean);
 if (!count) throw new Error('네이버 검색 결과를 읽지 못했어요. 잠시 후 다시 검색하거나 블로그에서 직접 확인해 주세요.');
 const total = Number(count[1].replaceAll(',', ''));
 if (!Number.isSafeInteger(total) || total < 0) throw new Error('검색 결과 건수를 확인하지 못했어요.');
 const posts = new Map<string, Post>();
 for (const anchor of [...doc.querySelectorAll<HTMLAnchorElement>('a.s_link[href]')].slice(0, 100)) {
  try {
   const identity = canonicalPost(new URL(anchor.getAttribute('href')!, 'https://blog.naver.com').href);
   if (identity.blogId !== ownId) continue;
   const header = anchor.closest('table');
   const record = header?.parentElement?.closest('table');
   const excerptRow = record?.tBodies[0]?.rows[1];
   const post = validatePost({ ...identity, title: text(anchor), tags: [], excerpt: text(excerptRow ?? null), publishedAt: dateOnly(text(header?.querySelector('.eng') ?? null)) }, request.blogUrl);
   if (!posts.has(post.url)) posts.set(post.url, post);
  } catch { /* Ignore unrelated or unsafe links; only own canonical post URLs reach the UI. */ }
 }
 if (total > 0 && !posts.size) throw new Error('검색된 글 목록을 읽지 못했어요. 잠시 후 다시 검색해 주세요.');
 if (total === 0 && posts.size) throw new Error('검색 결과 목록과 건수가 달라요. 다시 검색해 주세요.');
 const hasMore = posts.size > 0 && [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].some(anchor => {
  const href = anchor.getAttribute('href') ?? '';
  const nativePage = href.match(/^javascript:goPage\((\d+)\);?$/u);
  if (nativePage) return Number(nativePage[1]) > request.page;
  try {
   const url = new URL(href, blogSearchUrl(request)), page = Number(url.searchParams.get('cpage'));
   if (!Number.isInteger(page) || page <= request.page) return false;
   assertBlogSearchUrl(url.href, { ...request, page });
   return true;
  } catch { return false; }
 });
 return { ...request, posts: [...posts.values()], total, hasMore };
}
