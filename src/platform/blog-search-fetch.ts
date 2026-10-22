import { assertBlogSearchUrl, blogSearchUrl, type BlogSearchRequest } from '../core/blog-search';

export const BLOG_SEARCH_HTML_LIMIT = 2 * 1024 * 1024;

export async function fetchBlogSearchHtml(request: BlogSearchRequest): Promise<{ html: string; url: string }> {
 const url = blogSearchUrl(request), controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 12000);
 try {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: controller.signal });
  if (!response.ok) throw new Error('네이버 검색에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.');
  assertBlogSearchUrl(response.url || url, request);
  if (Number(response.headers.get('content-length') ?? 0) > BLOG_SEARCH_HTML_LIMIT) throw new Error('검색 결과가 너무 커요. 검색어를 더 구체적으로 입력해 주세요.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('네이버 검색 결과를 읽지 못했어요. 다시 검색해 주세요.');
  const decoder = new TextDecoder(), parts: string[] = [];
  let size = 0;
  try {
   while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BLOG_SEARCH_HTML_LIMIT) {
     await reader.cancel();
     throw new Error('검색 결과가 너무 커요. 검색어를 더 구체적으로 입력해 주세요.');
    }
    parts.push(decoder.decode(value, { stream: true }));
   }
   parts.push(decoder.decode());
  } finally { reader.releaseLock(); }
  return { html: parts.join(''), url: response.url || url };
 } catch (error) {
  if (controller.signal.aborted) throw new Error('검색 응답이 늦어지고 있어요. 다시 검색해 주세요.');
  if (error instanceof TypeError) throw new Error('네이버 검색에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 검색해 주세요.');
  throw error;
 } finally { clearTimeout(timeout); }
}
