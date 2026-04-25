document.querySelectorAll('.nav-item').forEach(item => {

    const trigger = item.querySelector('.nav-link');
    let openTimeout;
    let closeTimeout;
  
    if (!trigger) return;
  
    trigger.addEventListener('mouseenter', () => {
      clearTimeout(closeTimeout);
  
      openTimeout = setTimeout(() => {
        item.classList.add('open');
      }, 80); // 👈 apertura leggermente ritardata
    });
  
    item.addEventListener('mouseleave', () => {
      clearTimeout(openTimeout);
  
      closeTimeout = setTimeout(() => {
        item.classList.remove('open');
      }, 120);
    });
  
  });