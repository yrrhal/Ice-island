/* =====================================================================
   طبقة التأثيرات البصرية والحركية — js/effects.js
   =====================================================================
   طبقة مستقلة تمامًا فوق محرك اللعبة (canvas خاص بها + CSS)، لا تعدّل أي
   من كود الفيزياء أو منطق اللعب الأساسي — إضافة بحتة يمكن حذفها دون أي
   أثر على عمل اللعبة.
   ===================================================================== */

const Effects = (() => {
  let fxCanvas, fxCtx, particles = [];

  function ensureCanvas() {
    if (fxCanvas) return;
    fxCanvas = document.createElement('canvas');
    fxCanvas.id = 'fx-canvas';
    Object.assign(fxCanvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '60'
    });
    const container = document.getElementById('game-container') || document.body;
    container.appendChild(fxCanvas);
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
  }

  function resize() {
    if (!fxCanvas) return;
    const c = fxCanvas.parentElement;
    fxCanvas.width = c.clientWidth;
    fxCanvas.height = c.clientHeight;
    fxCtx = fxCanvas.getContext('2d');
  }

  function loop() {
    if (fxCtx) {
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 1;
        p.rot += p.vr;
        fxCtx.save();
        fxCtx.globalAlpha = Math.max(0, p.life / p.maxLife);
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot);
        fxCtx.fillStyle = p.color;
        fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        fxCtx.restore();
      });
      particles = particles.filter(p => p.life > 0);
    }
    requestAnimationFrame(loop);
  }

  const CONFETTI_COLORS = ['#ffd700', '#7dd8ff', '#ff6b9d', '#5dea8f', '#ffffff'];

  return {
    confettiBurst() {
      ensureCanvas();
      const cx = fxCanvas.width / 2, cy = fxCanvas.height * 0.35;
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          size: 5 + Math.random() * 5,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          life: 60 + Math.random() * 30,
          maxLife: 90
        });
      }
    },

    screenShake() {
      const el = document.getElementById('game-container');
      if (!el) return;
      el.classList.remove('fx-shake');
      // إعادة تشغيل الأنيميشن حتى لو كانت الفئة موجودة من قبل
      void el.offsetWidth;
      el.classList.add('fx-shake');
      setTimeout(() => el.classList.remove('fx-shake'), 350);
    }
  };
})();

/* ===== نبض عند تغيّر عدد الكوينز (بدون أي تعديل على game.js) ===== */
document.addEventListener('DOMContentLoaded', () => {
  ['coins', 'shop-coins'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new MutationObserver(() => {
      el.classList.remove('fx-pulse');
      void el.offsetWidth;
      el.classList.add('fx-pulse');
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* ===== موجة ضغط بصرية لأي زر في اللعبة ===== */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'fx-ripple';
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  });
});
