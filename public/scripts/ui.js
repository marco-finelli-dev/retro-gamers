document.addEventListener('DOMContentLoaded', () => {
  /*
    Mobile menu
  */
  const menu = document.querySelector('[data-mobile-menu]');
  const toggle = document.querySelector('[data-mobile-menu-toggle]');
  const closeButtons = document.querySelectorAll('[data-mobile-menu-close]');

  if (!menu || !toggle) return;

  const lockScroll = () => {
    document.documentElement.classList.add('has-mobile-menu-open');
    document.body.classList.add('has-mobile-menu-open');
  };

  const unlockScroll = () => {
    document.documentElement.classList.remove('has-mobile-menu-open');
    document.body.classList.remove('has-mobile-menu-open');
  };

  const openMenu = () => {
    menu.classList.add('is-open');
    menu.removeAttribute('inert');
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    lockScroll();
    menu.querySelector('button[data-mobile-menu-close]')?.focus({ preventScroll: true });
  };

  const closeMenu = () => {
    if (menu.classList.contains('is-open') && window.innerWidth < 1200) {
      toggle.focus({ preventScroll: true });
    }

    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('inert', '');
    toggle.setAttribute('aria-expanded', 'false');
    unlockScroll();
  };

  toggle.addEventListener('click', () => {
    menu.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeMenu);
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (!menu.classList.contains('is-open')) return;
    if (event.key === 'Tab') {
      const items = [...menu.querySelectorAll('a[href], button:not([disabled])')].filter(item => item.getClientRects().length);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1200) {
      closeMenu();
    }
  });

  window.addEventListener('orientationchange', closeMenu);

  window.addEventListener('pageshow', () => {
    closeMenu();
  });
});
