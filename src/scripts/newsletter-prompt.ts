// Same storage/timing convention as ArticleCommunityPrompt; that prompt has no
// shared controller. Subscription eligibility remains exclusively server-side.
const dismissedKey = 'retroGamersNewsletterPromptDismissedAt';
const shownKey = 'retroGamersNewsletterPromptShown';
const cooldown = 7 * 24 * 60 * 60 * 1000;
const delay = 55 * 1000;

export function initNewsletterPrompt() {
  const prompt = document.querySelector<HTMLElement>('[data-newsletter-prompt]');
  if (!prompt || prompt.dataset.initialized) return;
  prompt.dataset.initialized = 'true';
  document.body.append(prompt); // Escape main's stacking context, like Community.

  const get = (kind: 'localStorage' | 'sessionStorage', key: string) => {
    try { return window[kind].getItem(key); } catch { return null; }
  };
  const set = (kind: 'localStorage' | 'sessionStorage', key: string, value: string) => {
    try { window[kind].setItem(key, value); } catch { /* Still dismissible for this page. */ }
  };
  const suppressed = () => {
    const dismissedAt = Number(get('localStorage', dismissedKey) || 0);
    return get('sessionStorage', shownKey) === '1'
      || (Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < cooldown);
  };
  if (suppressed()) return;

  let ready = false;
  let shown = false;
  let dismissed = false;
  let previousFocus: HTMLElement | null = null;

  const hide = () => {
    // No focus trapping or focus stealing when opening. Restore focus only when
    // the currently focused shortcut becomes hidden (dismiss or another overlay).
    if (prompt.contains(document.activeElement)) {
      const target = previousFocus?.isConnected && previousFocus !== document.body
        ? previousFocus : document.querySelector<HTMLElement>('main');
      if (target) {
        const needsTabindex = !target.hasAttribute('tabindex') && target === document.querySelector('main');
        if (needsTabindex) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (needsTabindex) target.removeAttribute('tabindex');
      }
    }
    prompt.hidden = true;
  };
  const dismiss = () => {
    dismissed = true;
    set('localStorage', dismissedKey, String(Date.now()));
    set('sessionStorage', shownKey, '1');
    hide();
  };
  const blocked = () => {
    if (document.visibilityState !== 'visible') return true;
    if (document.documentElement.matches('.has-search-open, .has-mobile-menu-open')) return true;
    if (document.querySelector('.cookie-consent.is-visible:not([hidden]), [data-article-community-prompt]:not([hidden]), [data-retro-overlay]:not([hidden]), dialog[open]')) return true;
    const footer = document.querySelector('.site-footer') || document.querySelector('footer');
    const rect = footer?.getBoundingClientRect();
    return Boolean(rect && rect.top < innerHeight && rect.bottom > 0);
  };
  const update = () => {
    if (!ready || dismissed || blocked() || (!shown && suppressed())) {
      hide();
      return;
    }
    if (prompt.hidden) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      prompt.hidden = false;
    }
    // Do not cover the Home poll's controls while they are in this area.
    const poll = document.querySelector('[data-home-survey]')?.getBoundingClientRect();
    const box = prompt.getBoundingClientRect();
    if (poll && poll.bottom > box.top && poll.top < box.bottom && poll.right > box.left && poll.left < box.right) {
      hide();
      return;
    }
    shown = true;
    set('sessionStorage', shownKey, '1');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && event.key === 'Escape' && !prompt.hidden && !blocked()) dismiss();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === dismissedKey) { dismissed = true; hide(); }
  };
  prompt.querySelectorAll('[data-newsletter-dismiss]').forEach(button => button.addEventListener('click', dismiss));
  // Visiting signup is not proof of subscription: only remember the invitation.
  prompt.querySelector('[data-newsletter-cta]')?.addEventListener('click', dismiss);
  const timer = window.setTimeout(() => { ready = true; update(); }, delay);
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // Watch only existing competing surfaces, not the prompt's own hidden changes.
  document.querySelectorAll('.cookie-consent, [data-article-community-prompt], [data-retro-overlay], dialog').forEach(surface => {
    observer.observe(surface, { attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', update);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('pagehide', () => {
    hide();
    window.clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', update);
    document.removeEventListener('keydown', onKeyDown);
  }, { once: true });
}
