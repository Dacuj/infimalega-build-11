(() => {
  const film = document.getElementById('film');
  const menu = document.getElementById('menu');
  const names = document.getElementById('collezioni');
  const toggle = document.getElementById('collections-toggle');
  const collectionTitle = document.getElementById('collection-index-title');
  const closeMenu = menu.querySelector('.close-menu');
  const indexItems = menu.querySelectorAll('.index-item');
  const filmMenu = film.querySelector('.film-menu');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const menuEase = 'cubic-bezier(.76,0,.24,1)';
  let current;
  const animations = new Map();

  function clearEntry() {
    document.documentElement.classList.remove('home-mark-entry');
  }
  film.addEventListener('animationend', event => {
    if (event.animationName === 'entry-pullback') clearEntry();
  });
  // During the black hold the hidden gallery cannot receive the tap that skips it.
  film.addEventListener('pointerdown', event => {
    if (event.target === film && event.isPrimary !== false) clearEntry();
  });
  film.addEventListener('focusin', clearEntry);
  film.addEventListener('click', event => {
    if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
        event.target.closest('a[href]')) clearEntry();
  });
  addEventListener('pagehide', clearEntry);
  motion.addEventListener?.('change', event => { if (event.matches) clearEntry(); });

  function finishAnimation(element) {
    const animation = animations.get(element);
    animations.delete(element);
    animation?.cancel();
  }

  function animate(element, frames, duration, easing, done) {
    finishAnimation(element);
    if (motion.matches || !duration || !element.animate) {
      done?.();
      return;
    }
    const animation = element.animate(frames, { duration, easing, fill: 'both' });
    animations.set(element, animation);
    animation.onfinish = () => {
      if (animations.get(element) !== animation) return;
      finishAnimation(element);
      done?.();
    };
  }

  function focusOn(element) {
    element.focus({ preventScroll: true });
  }

  document.addEventListener('pointerdown', event => {
    menu.classList.toggle('touch-navigation', event.pointerType === 'touch' || event.pointerType === 'pen');
  }, { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    menu.classList.remove('touch-navigation');
    if (['Tab', 'Enter', ' ', 'Escape'].includes(event.key)) clearEntry();
  }, true);

  function setCollections(open, transition) {
    finishAnimation(names);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.href = open ? '#menu' : '#collezioni';
    closeMenu.href = open ? '#menu' : '#film';
    closeMenu.textContent = open ? 'Back' : 'Close';
    indexItems.forEach(item => { item.inert = open; });
    menu.classList.toggle('is-collections', open);
    names.inert = !open;
    if (open) {
      names.hidden = false;
      names.scrollTop = 0;
      if (transition) {
        animate(names, [
          { opacity: 0, transform: 'translateY(42px)', offset: 0 },
          { opacity: 0, transform: 'translateY(42px)', offset: .4 },
          { opacity: 1, transform: 'translateY(0)' }
        ], 720, 'ease-out');
      }
    } else if (transition) {
      animate(names, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(24px)' }],
        280, 'ease-out', () => { names.hidden = true; });
    } else {
      names.hidden = true;
    }
  }

  function sourceAlreadyCovered() {
    try {
      const key = 'infimalega:menu-arrival';
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (!raw) return false;
      const arrival = JSON.parse(raw);
      const age = Date.now() - arrival.time;
      return arrival.hash === location.hash && age >= 0 && age < 30000;
    } catch {
      return false;
    }
  }

  function enterMenu(covered) {
    finishAnimation(menu);
    menu.classList.remove('arriving', 'after-veil');
    if (motion.matches) return;
    // Reset the text reveal even when restoring a previously open menu from bfcache.
    void menu.offsetWidth;
    menu.classList.add(covered ? 'after-veil' : 'arriving');
    if (!covered) {
      animate(menu, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
        1200, menuEase);
    }
  }

  function route() {
    const hash = location.hash.slice(1);
    if (hash === 'contatti' || hash === 'quaderno') {
      location.replace('contatti.html');
      return;
    }
    const isMenu = hash === 'menu' || hash === 'collezioni';
    const next = isMenu ? hash : 'film';
    if (next === current) return;
    const previous = current;
    current = next;
    const wasMenu = previous === 'menu' || previous === 'collezioni';

    film.inert = isMenu;
    menu.inert = !isMenu;
    if (isMenu) window.filmStage.deactivate();
    else window.filmStage.activate();

    if (isMenu) {
      clearEntry();
      menu.hidden = false;
      setCollections(next === 'collezioni', wasMenu);
      if (!wasMenu) {
        enterMenu(sourceAlreadyCovered());
      } else {
        menu.classList.remove('arriving', 'after-veil');
      }
      if (previous) focusOn(next === 'collezioni' ? collectionTitle : (menu.classList.contains('touch-navigation') ? menu : toggle));
    } else if (wasMenu) {
      menu.classList.remove('arriving', 'after-veil');
      animate(menu, [{ transform: 'translateY(0)' }, { transform: 'translateY(-101%)' }],
        800, menuEase, () => { menu.hidden = true; });
    } else {
      finishAnimation(menu);
      menu.hidden = true;
    }
    if (!isMenu && previous) focusOn(filmMenu);
  }

  function navigate(hash) {
    if (location.hash !== hash) location.hash = hash;
    route();
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
  addEventListener('popstate', () => { clearEntry(); route(); });
  addEventListener('hashchange', route);
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    clearEntry();
    route();
    if (current === 'menu' || current === 'collezioni') {
      if (menu.classList.contains('touch-navigation')) focusOn(current === 'collezioni' ? collectionTitle : menu);
      enterMenu(sourceAlreadyCovered());
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const back = { menu: 'film', collezioni: 'menu' }[current];
    if (back) {
      event.preventDefault();
      navigate('#' + back);
    }
  });
  route();
})();
