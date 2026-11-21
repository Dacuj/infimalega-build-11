function keepCollectionFilmPlaying(video, recoverSource, deferred = false) {
  let checkTimer;
  let pendingPlay;
  let lastTime;
  let resumeAt;
  let frameRequest;
  let frameSeen = false;
  let playbackStarted = false;
  let stalledChecks = 0;
  let recoveryStep = 0;
  let blobRequested = false;
  let blobUrl;
  let restarted = false;
  let blockedByPolicy = false;
  let replaceOnResume = false;
  let pageActive = true;
  const originalSource = recoverSource ? video.querySelector("source[src]")?.src : undefined;

  function isVisible() {
    const bounds = video.getBoundingClientRect();
    return pageActive && !document.hidden && bounds.width > 0 && bounds.height > 0
      && bounds.bottom > 0 && bounds.top < window.innerHeight
      && bounds.right > 0 && bounds.left < window.innerWidth;
  }

  function play() {
    if (pendingPlay || blockedByPolicy || video.error) return;
    const request = Promise.resolve(video.play());
    pendingPlay = request;
    request.catch((error) => {
      if (pendingPlay !== request) return;
      if (error.name === "NotAllowedError") blockedByPolicy = true;
      if (deferred && error.name === "NotSupportedError") recoverHomeSource();
    }).finally(() => {
      if (pendingPlay === request) pendingPlay = undefined;
    });
  }

  function watchFrame() {
    if (!recoverSource || frameRequest !== undefined || !video.requestVideoFrameCallback) return;
    const player = video;
    frameRequest = player.requestVideoFrameCallback(() => {
      if (player !== video) return;
      frameRequest = undefined;
      frameSeen = true;
    });
  }

  function stopWatchingFrame() {
    if (frameRequest !== undefined) video.cancelVideoFrameCallback?.(frameRequest);
    frameRequest = undefined;
    frameSeen = false;
  }

  function replacePlayer(preservePosition, source = originalSource) {
    replaceOnResume = false;
    // A new element creates a fresh decoder when the restored one stops presenting frames.
    const previous = video;
    const next = previous.cloneNode(true);
    next.autoplay = deferred && isVisible();
    next.muted = previous.muted;
    if (source) next.querySelector("source").src = source;
    stopWatchingFrame();
    previous.pause();
    stalledChecks = 0;
    playbackStarted = false;
    resumeAt = preservePosition ? previous.currentTime || undefined : undefined;
    lastTime = 0;
    pendingPlay = undefined;
    video = next;
    next.addEventListener("loadedmetadata", () => {
      if (next === video) restorePosition();
    });
    previous.replaceWith(next);
    previous.removeAttribute("src");
    previous.replaceChildren();
    previous.load();
    watchFrame();
    play();
  }

  function requestLocalSource() {
    if (!originalSource || blobRequested) return;
    blobRequested = true;
    // The host can return a whole file to a range request. A Blob gives the
    // browser a seekable source even when the response is not partial.
    fetch(originalSource, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error("Unable to load collection film");
      return response.blob();
    }).then((blob) => {
      blobUrl = URL.createObjectURL(blob);
      if (isVisible()) syncPlayback();
    }).catch(() => {
      if (deferred && isVisible()) replacePlayer(false);
    });
  }

  function recoverHomeSource() {
    recoveryStep = 2;
    requestLocalSource();
  }

  function recoverPlayer() {
    recoveryStep += 1;
    if (recoveryStep === 1) {
      replacePlayer(false);
    } else requestLocalSource();
  }

  function restorePosition() {
    if (resumeAt === undefined || !isVisible() || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const time = resumeAt;
    resumeAt = undefined;
    for (let index = 0; index < video.seekable.length; index++) {
      if (video.seekable.start(index) <= time && time < video.seekable.end(index)) {
        video.currentTime = lastTime = time;
        break;
      }
    }
  }

  function suspend() {
    window.clearInterval(checkTimer);
    checkTimer = undefined;
    lastTime = undefined;
    stalledChecks = 0;
    restarted = false;
    stopWatchingFrame();
    if (deferred) video.autoplay = false;
    if (!video.paused) video.pause();
  }

  function checkProgress() {
    if (!isVisible()) {
      suspend();
      return;
    }

    const advanced = recoverSource && video.requestVideoFrameCallback
      ? frameSeen : video.currentTime !== lastTime;
    frameSeen = false;
    watchFrame();
    lastTime = video.currentTime;
    if (advanced && !video.seeking) {
      playbackStarted = true;
      stalledChecks = 0;
      restarted = false;
    } else if (!blockedByPolicy) {
      if (deferred && !playbackStarted && recoveryStep < 2) {
        // Give the initial stream time to start, then fall back if it never does.
        if (++stalledChecks >= 5) recoverHomeSource();
      } else if (recoverSource && recoveryStep < 2 && ++stalledChecks >= 2) {
        recoverPlayer();
        return;
      }
      if ((!recoverSource || (deferred && recoveryStep >= 2))
        && !restarted && !video.seeking && !video.error && !video.paused && !pendingPlay
        && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        restarted = true;
        video.pause();
      }
    }
    if (video.paused) play();
  }

  function syncPlayback() {
    if (!isVisible()) {
      suspend();
      return;
    }

    blockedByPolicy = false;
    if (deferred) video.autoplay = true;
    if (blobUrl && blobUrl !== video.querySelector("source")?.src) {
      replacePlayer(false, blobUrl);
    } else if (replaceOnResume) {
      replacePlayer(true, blobUrl || originalSource);
    } else {
      restorePosition();
      if (video.paused) play();
    }
    if (checkTimer === undefined) {
      lastTime = video.currentTime;
      watchFrame();
      checkTimer = window.setInterval(checkProgress, 2500);
    }
  }

  const sound = video.parentElement.querySelector(".film-sound");
  if (sound) {
    function showSoundState() {
      sound.setAttribute("aria-pressed", String(!video.muted));
    }
    sound.hidden = false;
    showSoundState();
    video.parentElement.addEventListener("volumechange", showSoundState, true);
    sound.addEventListener("click", () => {
      video.muted = !video.muted;
      showSoundState();
      blockedByPolicy = false;
      if (video.paused && isVisible()) play();
    });
  }

  // Keep native autoplay as a fallback when scripted visibility is unavailable.
  if (typeof IntersectionObserver !== "function") return;
  video.autoplay = false;
  new IntersectionObserver(syncPlayback, { threshold: [0, 0.01] }).observe(recoverSource ? video.parentElement : video);
  if (deferred) {
    const frame = video.parentElement;
    frame.addEventListener("canplay", (event) => {
      if (event.target === video && video.paused && isVisible()) syncPlayback();
    }, true);
    frame.addEventListener("error", (event) => {
      if (event.target === video || event.target.parentElement === video) recoverHomeSource();
    }, true);
    syncPlayback();
  }
  window.addEventListener("pagehide", () => {
    pageActive = false;
    if (recoverSource && video.currentSrc) {
      replaceOnResume = true;
      recoveryStep = blobRequested ? 2 : 0;
    }
    suspend();
  });
  window.addEventListener("pageshow", (event) => {
    pageActive = true;
    if (recoverSource && event.persisted && video.currentSrc) replaceOnResume = true;
    window.requestAnimationFrame(syncPlayback);
  });
  document.addEventListener("visibilitychange", syncPlayback);
}

function hydrateHomeFilm(film) {
  const video = film.querySelector("video");
  const source = video?.querySelector("source[data-src]");
  if (!source?.dataset.src) return;

  video.muted = true;
  video.autoplay = typeof IntersectionObserver !== "function";
  video.preload = "metadata";
  if (video.dataset.poster) video.poster = video.dataset.poster;
  source.src = source.dataset.src;
  source.removeAttribute("data-src");
  video.load();
  keepCollectionFilmPlaying(video, true, true);
}

let homeFilmObserver;
for (const film of document.querySelectorAll(".collection-film")) {
  for (const eventName of ["contextmenu", "dragstart"]) {
    film.addEventListener(eventName, (event) => event.preventDefault());
  }
  if (!film.hasAttribute("data-home-film")) {
    const video = film.querySelector("video");
    if (video) keepCollectionFilmPlaying(video, film.id === "amore-film");
  } else if (typeof IntersectionObserver !== "function") {
    hydrateHomeFilm(film);
  } else {
    homeFilmObserver ??= new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        hydrateHomeFilm(entry.target);
      }
    }, { rootMargin: "520px 0px" });
    homeFilmObserver.observe(film);
  }
}

function runwayVariants() {
  const word = "runway";
  const typos = [
    "Runawy", "rUnWaAy", "ruNwYa", "Runnway", "RuNwa", "Ruway",
    "rRuNWay", "runWaYY", "rUNwy", "rUNwaaY", "rUnwaYy", "RUNnWAy",
  ];
  const variants = ["Runway"];
  const combinations = 1 << word.length;
  for (let index = 1; index < combinations; index++) {
    // An odd step visits every casing once and breaks up alphabetical runs.
    const mask = (1 + index * 73) % combinations;
    const spelling = [...word].map((letter, position) => (
      mask & (1 << position) ? letter.toUpperCase() : letter
    )).join("");
    variants.push(spelling);
    if (index % 10 === 0 && typos.length) variants.push(typos.shift());
  }
  return variants;
}

const runwayMenu = document.querySelector("select.runway-menu");
if (runwayMenu) {
  const link = runwayMenu.nextElementSibling;
  const placeholder = new Option("Runway", "", true, true);
  placeholder.disabled = true;
  placeholder.hidden = true;
  runwayMenu.replaceChildren(placeholder, ...runwayVariants().map((variant) => new Option(variant)));
  runwayMenu.hidden = false;
  link.hidden = true;
  runwayMenu.addEventListener("change", () => {
    if (!runwayMenu.value) return;
    runwayMenu.selectedIndex = 0;
    link.click();
  });
}

function enableCollectionSwiping(viewer, currentImage, movePhoto) {
  const viewport = document.createElement("div");
  viewport.className = "viewer-photos";
  const track = document.createElement("div");
  track.className = "viewer-photo-track";

  const previous = new Image();
  const next = new Image();
  for (const neighbor of [previous, next]) {
    neighbor.alt = "";
    neighbor.draggable = false;
    neighbor.setAttribute("aria-hidden", "true");
  }
  currentImage.replaceWith(viewport);
  track.append(previous, currentImage, next);
  viewport.append(track);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let canSwipe = false;
  let drag;
  let snap;

  function reset() {
    drag = undefined;
    snap?.cancel();
    snap = undefined;
    track.style.removeProperty("--drag");
  }

  function update(gallery, index) {
    reset();
    canSwipe = gallery.length > 1;
    if (canSwipe) {
      previous.src = gallery[(index + gallery.length - 1) % gallery.length].href;
      next.src = gallery[(index + 1) % gallery.length].href;
    } else {
      previous.removeAttribute("src");
      next.removeAttribute("src");
    }
  }

  function updateZoom() {
    const zoomed = window.visualViewport?.scale > 1.01;
    viewport.classList.toggle("is-zoomed", zoomed);
    if (zoomed) reset();
  }
  updateZoom();
  window.visualViewport?.addEventListener("resize", updateZoom);

  // A second finger can land outside the photo on the toolbar.
  viewer.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && !event.isPrimary) reset();
  }, true);

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary || !canSwipe || viewport.classList.contains("is-zoomed")) return;
    reset();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: event.timeStamp, horizontal: false };
  });

  function displacement(event) {
    const width = viewport.clientWidth;
    return Math.max(-width, Math.min(width, event.clientX - drag.x));
  }

  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = displacement(event);
    const dy = Math.abs(event.clientY - drag.y);
    if (!drag.horizontal) {
      if (Math.max(Math.abs(dx), dy) < 8) return;
      if (dy > Math.abs(dx)) {
        reset();
        return;
      }
      if (Math.abs(dx) < dy * 1.25) return;
      drag.horizontal = true;
    }
    track.style.setProperty("--drag", dx + "px");
  });

  viewport.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = displacement(event);
    const distance = Math.abs(dx);
    const elapsed = Math.max(1, event.timeStamp - drag.start);
    const width = viewport.clientWidth;
    const horizontal = drag.horizontal && distance > Math.abs(event.clientY - drag.y) * 1.25;
    const farEnough = distance >= Math.min(width * .23, 100);
    const flick = distance >= 36 && distance / elapsed > .5;
    const direction = horizontal && (farEnough || flick) ? -Math.sign(dx) : 0;
    const follow = drag.horizontal;
    reset();
    if (direction) movePhoto(direction);

    // The selected photo starts where the neighboring image was under the finger.
    const remaining = dx + direction * width;
    if (follow && remaining && !reducedMotion.matches && track.animate) {
      snap = track.animate([
        { transform: `translate3d(calc(-100% + ${remaining}px), 0, 0)` },
        { transform: "translate3d(-100%, 0, 0)" },
      ], { duration: 220, easing: "cubic-bezier(.22,.8,.25,1)" });
    }
  });

  viewport.addEventListener("pointercancel", reset);
  return { update, reset };
}

const viewer = document.querySelector(".viewer");
if (viewer && typeof viewer.showModal === "function") {
  const viewerImage = document.querySelector("#viewer-image");
  const viewerTitle = document.querySelector("#viewer-title");
  const closeButton = viewer.querySelector(".viewer-close");
  const previousButton = viewer.querySelector(".viewer-prev");
  const nextButton = viewer.querySelector(".viewer-next");
  let gallery = [];
  let currentPhoto = 0;
  let returnFocus;
  const swiping = document.body.classList.contains("editorial-page")
    ? enableCollectionSwiping(viewer, viewerImage, movePhoto)
    : null;

  function showPhoto(index) {
    currentPhoto = (index + gallery.length) % gallery.length;
    const photo = gallery[currentPhoto];
    viewerImage.alt = photo.querySelector("img")?.alt ?? "";
    viewerImage.src = photo.href;
    swiping?.update(gallery, currentPhoto);
  }

  function movePhoto(offset) {
    if (gallery.length > 1) showPhoto(currentPhoto + offset);
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const photo = event.target.closest?.("[data-photo]");
    const galleryRoot = photo?.closest("[data-gallery]");
    if (!galleryRoot) return;

    event.preventDefault();
    gallery = [...galleryRoot.querySelectorAll("[data-photo]")];
    const single = gallery.length === 1;
    previousButton.hidden = single;
    nextButton.hidden = single;
    viewer.classList.toggle("viewer--single", single);
    viewerTitle.textContent = galleryRoot.getAttribute("aria-label");
    returnFocus = photo;
    showPhoto(gallery.indexOf(photo));
    viewer.showModal();
    closeButton.focus();
  });

  closeButton.addEventListener("click", () => viewer.close());
  previousButton.addEventListener("click", () => movePhoto(-1));
  nextButton.addEventListener("click", () => movePhoto(1));
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") movePhoto(-1);
    if (event.key === "ArrowRight") movePhoto(1);
  });
  viewer.addEventListener("close", () => {
    swiping?.reset();
    returnFocus?.focus();
  });
}
