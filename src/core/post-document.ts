import type { Post } from './types';

function text(node:Element|null):string {
 if(!node)return '';
 const copy=node.cloneNode(true) as Element;
 copy.querySelectorAll('script,style,noscript,button,.se-placeholder').forEach(e=>e.remove());
 return (copy.textContent??'').replace(/[\u200b\ufeff]/gu,'').replace(/\s+/gu,' ').trim();
}

function dateOnly(raw:string):string {
 const match=raw.match(/\b(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?=\D|$)/u);
 if(!match)return '';
 const value=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
 const parsed=new Date(value+'T00:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';
}

/** Read published article metadata without inheriting the viewer's layout tables. */
export function readPostDocument(doc:Document,identity:Pick<Post,'blogId'|'postId'|'url'>):Omit<Post,'collectedAt'> {
 const titleNode=doc.querySelector('.se-title-text .se-text-paragraph')??doc.querySelector('.se-title-text')??doc.querySelector('.se-documentTitle .se-text-paragraph')??doc.querySelector('.htitle,.itemSubject');
 const title=text(titleNode)||doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim()||'';
 if(!title)throw new Error('제목을 자동으로 읽지 못했어요. 제목과 원문 발췌를 직접 입력하거나 열린 내 글을 등록해 주세요.');
 const root=doc.querySelector('.se-main-container,.post-view,#post-view');
 const paragraphs=root?[...root.querySelectorAll(root.matches('.se-main-container')?'.se-text-paragraph':'p')]:[];
 const excerpt=paragraphs.filter(p=>{
  const excluded=p.closest('.se-title-text,.se-documentTitle,.se-table,table,.se-code,pre,code,.se-module-image-caption,.se-caption,.se-oglink');
  // The published viewer's surrounding table is outside the article.
  return !excluded||!root!.contains(excluded);
 }).map(p=>text(p)).filter(Boolean).join(' ').slice(0,400);
 const tagRoot=doc.getElementById('tagList_'+identity.postId);
 const tagNodes=tagRoot?.querySelectorAll('a.itemTagfont')??doc.querySelectorAll('.post_tag a,.tag a,.item_tag a');
 const tags=[...new Set([...tagNodes].map(e=>text(e).replace(/^#/,'')))].filter(Boolean);
 const nativeDates=[...doc.querySelectorAll('.se_publishDate,.se-documentTitle time')];
 const dateNodes=nativeDates.length?nativeDates:[...doc.querySelectorAll('.post-view .date,#post-view .date,.post-head .date,time[datetime],.blog2_container time')];
 const dates=dateNodes.flatMap(date=>[date.getAttribute('datetime')??'',date.getAttribute('title')??'',text(date)]);
 dates.push(doc.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content??'');
 return {...identity,title,tags,excerpt,publishedAt:dates.map(dateOnly).find(Boolean)??''};
}
