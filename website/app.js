import { siteConfig } from './site.config.js';
import { initMotion, animateProductImage } from './motion.js';

// A release URL is used only once the public store listing is ready.
let storeUrl;
try {
  const candidate = new URL(siteConfig.chromeWebStoreUrl);
  if (candidate.protocol === 'https:' && candidate.hostname === 'chromewebstore.google.com' && candidate.pathname.startsWith('/detail/')) storeUrl = candidate.href;
} catch { /* Prelaunch is a supported state. */ }
if (storeUrl) {
  document.querySelectorAll('.install-link').forEach(link => { link.href = storeUrl; });
  document.querySelectorAll('[data-install-label]').forEach(label => { label.textContent = 'Chrome에 추가'; });
  document.querySelectorAll('[data-release-status]').forEach(label => { label.textContent = 'Chrome 웹 스토어에서 설치'; });
  document.querySelectorAll('[data-release-note]').forEach(note => { note.textContent = 'Chrome 웹 스토어에서 글부기를 설치할 수 있어요. 아래 버튼을 누르고 ‘Chrome에 추가’와 ‘확장 프로그램 추가’를 선택해 주세요.'; });
}

const menu = document.querySelector('.mobile-menu');
menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { menu.open = false; }));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu) menu.open = false; });

const gallery = {
  format: { label: '서식·인용구', src: '/assets/screenshots/format.png', description: '자주 쓰는 서식과 인용구를 저장하고, 선택 영역에 적용하세요. 지정한 단축키로도 빠르게 적용할 수 있어요.', alt: '가을 산책 예시 원고 옆에 서식 프리셋 패널이 열린 글부기 실제 실행 화면' },
  links: { label: '내 글 링크', src: '/assets/screenshots/links.png', description: '내 블로그의 공개 글을 검색하거나 저장한 글을 찾아, 원하는 위치에 네이버 링크 카드로 넣어요.', alt: '가을 산책 예시 원고 옆에 저장한 글의 제목과 발췌, 미리보기 삽입 버튼이 보이는 실제 화면' },
  photos: { label: '사진 정리', src: '/assets/screenshots/photos.png', description: '사진을 지정한 문단 앞뒤로 옮기고 새 사진을 추가해요. 현재 글의 사진 AI 활용 설정도 한곳에서 켤 수 있어요.', alt: '예시 원고와 사진 AI 활용 설정, 사진 위치를 관리하는 글부기 실제 사진 패널' },
  linebreak: { label: '줄바꿈', src: '/assets/screenshots/linebreak.png', description: '문장·구절을 우선해 줄을 나누고, 원문과 변경 후의 실제 줄바꿈 위치를 비교한 뒤 적용해요.', alt: '변경 전 원문과 변경 후 줄바꿈 위치를 나란히 보여주는 글부기 줄바꿈 미리보기 실제 화면' },
  schedule: { label: '예약 시간', src: '/assets/screenshots/schedule.png', description: '예약 날짜와 자주 쓰는 시간을 편하게 설정해요. 최종 발행은 네이버 화면에서 직접 확인하고 실행해 주세요.', alt: '예약 날짜, 시간, 자주 쓰는 시간 설정이 보이는 글부기 실제 예약 패널' },
};
let currentFeature = 'format';
const tabs = [...document.querySelectorAll('[data-feature]')];
const productImage = document.querySelector('#product-image');
function activateTab(tab) {
  if (currentFeature === tab.dataset.feature) return;
  currentFeature = tab.dataset.feature;
  const feature = gallery[currentFeature];
  tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
  productImage.src = feature.src;
  productImage.alt = feature.alt;
  animateProductImage(productImage);
  document.querySelector('#product-panel').setAttribute('aria-labelledby', tab.id);
  document.querySelector('[data-zoom-current]').setAttribute('aria-label', `${feature.label} 실행 화면 확대 보기`);
  document.querySelector('#product-description').textContent = feature.description;
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    activateTab(tabs[nextIndex]);
  });
});
// Native details keep navigation and the FAQ usable without JavaScript.
document.documentElement.classList.add('enhanced');
const dialog = document.querySelector('#image-dialog');
if (dialog) {
  const dialogImage = document.querySelector('#dialog-image');
  function openImage(src, label) {
    dialogImage.src = src;
    dialogImage.alt = label;
    document.querySelector('#image-dialog-title').textContent = label;
    dialog.showModal();
    document.documentElement.classList.add('has-image-dialog');
  }
  document.querySelector('[data-zoom-current]')?.addEventListener('click', () => { const feature = gallery[currentFeature]; openImage(feature.src, `${feature.label} 실제 실행 화면`); });
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => openImage(button.dataset.zoom, button.dataset.zoomLabel)));
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
  dialog.addEventListener('close', () => { document.documentElement.classList.remove('has-image-dialog'); });
}

initMotion();
