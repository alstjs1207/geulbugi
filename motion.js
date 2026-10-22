// Small, one-time entrances. Content stays visible if motion is unavailable.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeAnimations = new Set();
const revealAnimations = new Map();
const revealed = new WeakSet();
let observer;
let initialized = false;
let imageAnimation;
let imageVersion = 0;

function animate(element, keyframes, options) {
  if (preference.matches || typeof element?.animate !== 'function') return;
  const animation = element.animate(keyframes, options);
  activeAnimations.add(animation);
  const cleanup = () => activeAnimations.delete(animation);
  animation.addEventListener('finish', cleanup, { once: true });
  animation.addEventListener('cancel', cleanup, { once: true });
  return animation;
}

function reveal(element, delay = 0) {
  if (revealed.has(element) || !element.getClientRects().length) return;
  revealed.add(element);
  if (element.contains(document.activeElement)) return;
  const animation = animate(element, [
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 650, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
  if (!animation) return;
  revealAnimations.set(element, animation);
  const cleanup = () => revealAnimations.delete(element);
  animation.addEventListener('finish', cleanup, { once: true });
  animation.addEventListener('cancel', cleanup, { once: true });
}

const scrollTargets = [
  '.section-heading', '.feature-card', '.shortcut-copy', '.shortcut-figure',
  '.setup-box', '.faq > div:first-child', '.faq-list details', '.closing-band',
];

function observeSections() {
  observer?.disconnect();
  if (preference.matches || !('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      const siblings = [...element.parentElement.children];
      const stagger = element.matches('.feature-card, .faq-list details')
        ? Math.min(siblings.indexOf(element) * 65, 130) : 0;
      reveal(element, stagger);
      observer.unobserve(element);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  document.querySelectorAll(scrollTargets.join(',')).forEach(element => {
    if (!revealed.has(element)) observer.observe(element);
  });
}

export function initMotion() {
  if (initialized) return;
  initialized = true;
  // A deep link should land immediately on its requested content.
  if (!location.hash && !preference.matches) {
    const heroParts = ['.hero .eyebrow-pill', '.hero h1', '.hero-description', '.hero-actions', '.compatibility', '.hero-art'];
    heroParts.forEach((selector, index) => {
      const element = document.querySelector(selector);
      if (element) reveal(element, Math.min(index * 65, 260));
    });
    const preview = document.querySelector('.product-panel');
    if (preview && preview.getBoundingClientRect().top < innerHeight) reveal(preview, 220);
  }
  const preview = document.querySelector('.product-panel');
  if (preview && !revealed.has(preview) && !preference.matches) {
    // Mobile or short windows may put the preview below the first viewport.
    scrollTargets.push('.product-panel');
  }
  observeSections();
  preference.addEventListener('change', () => {
    if (preference.matches) {
      observer?.disconnect();
      activeAnimations.forEach(animation => animation.cancel());
    } else observeSections();
  });
  // Keyboard navigation never waits behind an entrance animation.
  document.addEventListener('focusin', event => {
    for (const [element, animation] of revealAnimations) {
      if (element.contains(event.target)) animation.cancel();
    }
  });
  document.querySelectorAll('.faq-list details').forEach(details => {
    details.addEventListener('toggle', () => {
      const answer = details.querySelector('p');
      if (details.open && answer) animate(answer, [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 220, easing: 'ease-out' });
    });
  });
}

export function animateProductImage(image) {
  const version = ++imageVersion;
  imageAnimation?.cancel();
  if (preference.matches) return;
  // Wait for the actual image, and ignore a superseded fast tab selection.
  image.decode().then(() => {
    if (version !== imageVersion) return;
    imageAnimation = animate(image, [
      { opacity: 0.45, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 300, easing: 'cubic-bezier(.2, .7, .3, 1)' });
  }).catch(() => { /* An image change may interrupt decoding; keep it visible. */ });
}
