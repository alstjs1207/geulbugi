import type { Post } from './types';
import { canonicalPost, normalizeBlog, validatePost } from './security';
import { normalizeCategoryNo } from './blog-categories';

export type RecentBlogPost = Post & { publishedLabel: string };
export type RecentBlogResult = { blogUrl: string; posts: RecentBlogPost[] };
export type RecentBlogPage = RecentBlogResult & { hasMore: boolean };
export const RECENT_BLOG_LIMIT = 10;
export const RECENT_BLOG_PAGE_LIMIT = 10;
export const RECENT_BLOG_RELOAD_MESSAGE = '최근 글 페이지가 갱신되지 않았어요. 글부기 패널을 닫고 chrome://extensions에서 글부기를 새로고침한 뒤 다시 열어 주세요.';

export function recentBlogUrl(input: string, page = 1, categoryNo = '0'): string {
 const blogUrl = normalizeBlog(input);
 if (!blogUrl) throw new Error('내 블로그 주소를 먼저 설정해 주세요.');
 if (!Number.isInteger(page) || page < 1 || page > RECENT_BLOG_PAGE_LIMIT) throw new Error('최근 글 페이지를 확인해 주세요.');
 const url = new URL('https://blog.naver.com/PostList.naver');
 url.search = new URLSearchParams({ blogId: blogUrl.split('/').at(-1)!, categoryNo: normalizeCategoryNo(categoryNo), from: 'postList', currentPage: String(page) }).toString();
 return url.href;
}

export function assertRecentBlogUrl(input: string, blogUrl: string, page = 1, categoryNo = '0'): void {
 const url = new URL(input), expected = new URL(recentBlogUrl(blogUrl, page, categoryNo));
 if (url.origin !== expected.origin || url.username || url.password || url.pathname !== expected.pathname ||
     ['blogId', 'categoryNo'].some(key => url.searchParams.get(key) !== expected.searchParams.get(key))) {
  throw new Error('내 블로그의 최근 글 목록을 확인하지 못했어요. 다시 시도해 주세요.');
 }
 // A missing page parameter denotes page one. An older worker can ignore the
 // newer panel's page argument and keep returning page one after an update.
 const actualPage = url.searchParams.get('currentPage') ?? '1';
 if (actualPage !== String(page)) {
  if (page > 1 && actualPage === '1') throw new Error(RECENT_BLOG_RELOAD_MESSAGE);
  throw new Error('내 블로그의 최근 글 목록을 확인하지 못했어요. 다시 시도해 주세요.');
 }
}

function text(node: Element | null): string {
 if (!node) return '';
 const copy = node.cloneNode(true) as Element;
 copy.querySelectorAll('script,style,noscript').forEach(element => element.remove());
 return (copy.textContent ?? '').replace(/[\u200b\ufeff]/gu, '').replace(/\s+/gu, ' ').trim();
}

/** Read one public page in Naver's order. Notices and body links are not posts. */
export function readRecentBlogDocument(doc: Document, input: string, page = 1, categoryNo = '0'): RecentBlogPage {
 const blogUrl = normalizeBlog(input);
 categoryNo = normalizeCategoryNo(categoryNo);
 recentBlogUrl(blogUrl, page, categoryNo);
 const root = doc.querySelector('#postListBody');
 if (!root) throw new Error('최근 글 목록을 읽지 못했어요. 잠시 후 새로고침해 주세요.');
 const articleRecords = [...root.querySelectorAll('.post[id]')].filter(element => /^post_\d+$/u.test(element.id));
 // Category-specific layouts can use Naver's album list instead of full posts.
 // Only the native top-level album is a source; never inspect article body links.
 const albumRecords = articleRecords.length ? [] : [...root.querySelectorAll(':scope > #PostThumbnailAlbumViewArea > .thumblist > li.item')];
 const records = (articleRecords.length ? articleRecords : albumRecords).slice(0, 30);
 const posts = new Map<string, RecentBlogPost>();
 for (const record of records) {
  // The article's URL-copy control identifies the post; never use links from its body.
  const rawUrl = record.querySelector<HTMLInputElement>('.copyTargetUrl')?.getAttribute('value') ??
   record.querySelector('a[id^="copyBtn_"]')?.getAttribute('title') ??
   (albumRecords.length ? record.querySelector('a.link[href]')?.getAttribute('href') : undefined);
  if (!rawUrl) throw new Error('최근 글 주소를 읽지 못했어요. 잠시 후 새로고침해 주세요.');
  const identity = canonicalPost(new URL(rawUrl, blogUrl).href);
  const title = text(record.querySelector('.se-title-text,.se-documentTitle .se-text-paragraph,.htitle,.itemSubject,.area_text .title'));
  const publishedLabel = text(record.querySelector('.se_publishDate,.se-documentTitle time,.post-top .date,.post-head .date,.area_text .date'));
  const match = publishedLabel.match(/\b(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})(?=\D|$)/u);
  const date = match ? match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0') : '';
  const validDate = date && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : '';
  const post = validatePost({ ...identity, title, tags: [], excerpt: '', publishedAt: validDate }, blogUrl);
  if (!posts.has(post.url)) posts.set(post.url, { ...post, publishedLabel });
 }
 // Changed markup and blocked pages must not masquerade as an empty blog.
 if (!posts.size && (records.length || !/(?:작성된 글|등록된 글|게시글)이 없습니다[.!]?/u.test(text(root)))) {
  throw new Error('최근 글 목록을 읽지 못했어요. 잠시 후 새로고침해 주세요.');
 }
 const hasNextLink = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].some(anchor => {
  try {
   const url = new URL(anchor.getAttribute('href')!, recentBlogUrl(blogUrl, page, categoryNo));
   const nextPage = Number(url.searchParams.get('currentPage'));
   if (nextPage <= page) return false;
   assertRecentBlogUrl(url.href, blogUrl, nextPage, categoryNo);
   return true;
  } catch { return false; }
 });
 // One-post layouts render the pager with JavaScript after the HTML arrives.
 // Read the public category count and native page size as data, never execute
 // the page's scripts. Body embeds must not supply this viewer configuration.
 const heading = [...doc.querySelectorAll('#category-name .category_title')].find(element => !root.contains(element)) ?? null;
 const count = text(heading).match(/(?:^|\s)([\d,]+)개의\s*글(?:\s|$)/u);
 const total = count ? Number(count[1].replaceAll(',', '')) : NaN;
 const pageSizes = new Set([...doc.scripts].filter(script => !root.contains(script)).flatMap(script => {
  const match = (script.textContent ?? '').match(/(?:^|[\r\n])\s*var\s+pagePerPostCount\s*=\s*(\d+)\s*;/u);
  return match ? [Number(match[1])] : [];
 }));
 const pageSize = pageSizes.size === 1 ? [...pageSizes][0] : NaN;
 const matchesCategory = categoryNo === '0' ? text(heading?.querySelector('#categoryTitle') ?? null) === '전체보기' :
  doc.querySelector<HTMLInputElement>('#blog-category input#categoryNo')?.value === categoryNo;
 const hasMoreByCount = matchesCategory &&
  Number.isSafeInteger(total) && total >= 0 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 30 &&
  records.length <= pageSize && total > page * pageSize;
 const hasMore = posts.size > 0 && (hasNextLink || hasMoreByCount);
 return { blogUrl, posts: [...posts.values()], hasMore };
}
