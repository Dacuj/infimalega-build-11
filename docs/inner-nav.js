(() => {
  const pageArrival = 'infimalega:page-arrival';
  const menuArrival = 'infimalega:menu-arrival';
  const base = new URL('.', document.currentScript.src);
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let curtain;
  let destination;

  // Sites can serve /shop.html as /shop. Restrict wipes to pages alongside this script.
  function pageName(url) {
    if (url.protocol !== base.protocol || url.origin !== base.origin ||
        !url.pathname.startsWith(base.pathname)) return null;
    const name = url.pathname.slice(base.pathname.length).replace(/\/$/, '').replace(/\.html$/i, '');
    if (name && !/^[\w-]+$/.test(name)) return null;
    return name === 'index' ? '' : name;
  }

  function arrivalPath(url) {
    return base.pathname + pageName(url) + url.search + url.hash;
  }

  function clearReveal() {
    root.classList.remove('page-arriving', 'page-revealing');
  }

  function beginArrival() {
    let handoff;
    try {
      const value = sessionStorage.getItem(pageArrival);
      if (!value) return;
      sessionStorage.removeItem(pageArrival);
      handoff = JSON.parse(value);
    } catch {
      return;
    }
    if (reducedMotion.matches || !handoff || handoff.path !== arrivalPath(location)) return;
    const age = Date.now() - handoff.time;
    if (!(age >= 0 && age < 30000)) return;

    // This script runs in the head: cover the incoming document before its first paint.
    root.classList.add('page-arriving');
    document.addEventListener('DOMContentLoaded', () => {
      requestAnimationFrame(() => {
        root.classList.add('page-revealing');
        setTimeout(clearReveal, 500);
      });
    }, { once: true });
  }

  function navigate(url, toMenu, animated) {
    if (destination !== url) return;
    if (toMenu || animated) {
      const arrival = toMenu ? { hash: url.hash } : { path: arrivalPath(url) };
      try {
        sessionStorage.setItem(toMenu ? menuArrival : pageArrival,
          JSON.stringify({ ...arrival, time: Date.now() }));
      } catch {
        // The destination still works with storage disabled.
      }
    }
    location.assign(url.href);
  }

  beginArrival();

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || link.hasAttribute('data-photo') ||
        (link.target && link.target !== '_self')) return;
    if (destination) {
      event.preventDefault();
      return;
    }
    const url = new URL(link.href);
    const next = pageName(url);
    if (next === null || (next === pageName(location) && url.search === location.search)) return;

    const toMenu = next === '' && ['#menu', '#collezioni'].includes(url.hash);
    const animated = !reducedMotion.matches && typeof Element.prototype.animate === 'function';
    if (!animated && !toMenu) return;
    event.preventDefault();
    destination = url;
    if (!animated) {
      navigate(url, toMenu, false);
      return;
    }

    curtain = document.createElement('div');
    curtain.className = toMenu ? 'inner-menu-curtain' : 'inner-page-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    document.body.append(curtain);
    const animation = curtain.animate(
      [{ transform: toMenu ? 'translateY(100%)' : 'translateY(-100%)' }, { transform: 'translateY(0)' }],
      { duration: toMenu ? 720 : 330, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'both' }
    );
    const leave = () => navigate(url, toMenu, true);
    animation.finished.then(leave, leave);
  });

  window.addEventListener('pagehide', () => { destination = null; });
  window.addEventListener('pageshow', (event) => {
    // A history traversal can restore the departing page with its curtain still in the DOM.
    if (!event.persisted) return;
    destination = null;
    curtain?.remove();
    curtain = null;
    clearReveal();
  });
})();
