document.addEventListener('DOMContentLoaded', () => {
  /*
    Drawer generici
  */
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.open;
      document.getElementById(`${target}-drawer`)?.classList.add('active');
    });
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.drawer')?.classList.remove('active');
    });
  });


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
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    lockScroll();
  };

  const closeMenu = () => {
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
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
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) {
      closeMenu();
    }
  });

  window.addEventListener('orientationchange', closeMenu);

  window.addEventListener('pageshow', () => {
    closeMenu();
  });
});