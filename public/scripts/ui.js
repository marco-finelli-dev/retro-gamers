document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.open;
      document.getElementById(`${target}-drawer`)?.classList.add('active');
    });
  });
  
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.drawer')?.classList.remove('active');
    });
  });