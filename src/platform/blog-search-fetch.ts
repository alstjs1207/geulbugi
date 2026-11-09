import { assertBlogSearchUrl, blogSearchUrl, type BlogSearchRequest } from '../core/blog-search';
import { assertRecentBlogUrl, recentBlogUrl } from '../core/blog-recent';
import { assertBlogCategoryWidgetUrl, blogCategoryWidgetUrl } from '../core/blog-categories';

export const BLOG_SEARCH_HTML_LIMIT = 2 * 1024 * 1024;

export async function fetchBlogSearchHtml(request: BlogSearchRequest): Promise<{ html: string; url: string }> {
 return fetchPublicBlogHtml(blogSearchUrl(request), url => assertBlogSearchUrl(url, request), '검색');
}

export async function fetchRecentBlogHtml(blogUrl: string, page = 1, categoryNo = '0'): Promise<{ html: string; url: string }> {
 return fetchPublicBlogHtml(recentBlogUrl(blogUrl, page, categoryNo), url => assertRecentBlogUrl(url, blogUrl, page, categoryNo), '최근 글 목록');
}

// Run in the Naver content frame: the public widget requires a Naver referrer.
export async function fetchBlogCategoryWidget(blogUrl: string): Promise<{ html: string; url: string }> {
 return fetchPublicBlogHtml(blogCategoryWidgetUrl(blogUrl), url => assertBlogCategoryWidgetUrl(url, blogUrl), '카테고리');
}

async function fetchPublicBlogHtml(url: string, assertUrl: (url: string) => void, label: string): Promise<{ html: string; url: string }> {
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 12000);
 try {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
  if (!response.ok) throw new Error(`네이버 ${label}에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.`);
  assertUrl(response.url || url);
  if (Number(response.headers.get('content-length') ?? 0) > BLOG_SEARCH_HTML_LIMIT) throw new Error(`${label} 자료가 너무 커요. 네이버 블로그에서 직접 확인해 주세요.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`네이버 ${label} 자료를 읽지 못했어요. 다시 시도해 주세요.`);
  const decoder = new TextDecoder(), parts: string[] = [];
  let size = 0;
  try {
   while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BLOG_SEARCH_HTML_LIMIT) {
     await reader.cancel();
     throw new Error(`${label} 자료가 너무 커요. 네이버 블로그에서 직접 확인해 주세요.`);
    }
    parts.push(decoder.decode(value, { stream: true }));
   }
   parts.push(decoder.decode());
  } finally { reader.releaseLock(); }
  return { html: parts.join(''), url: response.url || url };
 } catch (error) {
  if (controller.signal.aborted) throw new Error(`${label} 응답이 늦어지고 있어요. 다시 시도해 주세요.`);
  if (error instanceof TypeError) throw new Error(`네이버 ${label}에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.`);
  throw error;
 } finally { clearTimeout(timeout); }
}
