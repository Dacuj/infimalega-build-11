(() => {
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const navigation = performance.getEntriesByType?.('navigation')[0];
  if (motion.matches || navigation?.type === 'back_forward') return;

  // Set this in the head so the complete directory never flashes before the cursor.
  root.dataset.terminal = 'waiting';
  const started = performance.now();
  let timer;
  function finish() {
    clearTimeout(timer);
    delete root.dataset.terminal;
    for (const name of ['pointerdown', 'keydown', 'focusin']) document.removeEventListener(name, finish, true);
    window.removeEventListener('pagehide', finish);
    motion.removeEventListener?.('change', finish);
  }
  for (const name of ['pointerdown', 'keydown', 'focusin']) document.addEventListener(name, finish, true);
  window.addEventListener('pagehide', finish);
  motion.addEventListener?.('change', finish);

  document.addEventListener('DOMContentLoaded', () => {
    if (root.dataset.terminal !== 'waiting') return;
    const lines = document.querySelectorAll('.terminal-line');
    let delay = 0;
    for (const line of lines) {
      const n = line.querySelector('.terminal-text').textContent.length;
      const duration = 28 * n;
      line.style.setProperty('--letters', String(n));
      line.style.setProperty('--line-width', n + 'ch');
      line.style.setProperty('--duration', duration + 'ms');
      line.style.setProperty('--delay', delay + 'ms');
      delay += duration + 110;
    }
    timer = setTimeout(() => {
      root.dataset.terminal = 'typing';
      timer = setTimeout(finish, delay - 110);
    }, Math.max(0, 1950 - (performance.now() - started)));
  }, { once: true });
})();
