document.querySelectorAll('.card').forEach(card => {
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
  
    const speed = 0.08;
  
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
  
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
  
      targetX = x * 6;
      targetY = y * 4;
    });
  
    card.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
    });
  
    function animate() {
      currentX += (targetX - currentX) * speed;
      currentY += (targetY - currentY) * speed;
  
      card.style.transform = `
        translateY(-6px)
        rotateX(${ -currentY }deg)
        rotateY(${ currentX }deg)
      `;
  
      requestAnimationFrame(animate);
    }
  
    animate();
  });

  document.querySelectorAll('.meta-badge').forEach(badge => {
    badge.addEventListener('mousemove', (e) => {
      const rect = badge.getBoundingClientRect();
  
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
  
      badge.style.setProperty('--x', `${x}%`);
      badge.style.setProperty('--y', `${y}%`);
    });
  
    badge.addEventListener('mouseleave', () => {
      badge.style.setProperty('--x', '50%');
      badge.style.setProperty('--y', '50%');
    });
  });

  document.querySelectorAll('[data-link]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      window.location.href = card.dataset.link;
    });
  });
  
  document.querySelectorAll('.card').forEach(card => {
    const img = card.querySelector('img');
    if (!img) return;
  
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
  
      img.style.transform = `scale(1.08) translate(${x * 6}px, ${y * 6}px)`;
    });
  
    card.addEventListener('mouseleave', () => {
      img.style.transform = 'scale(1.04)';
    });
  });