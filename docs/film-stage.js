(() => {
  const stage = document.querySelector("#film-stage");
  if (!stage) return;

  const folder = "media/portfolio/";
  const massimiliano = "media/ammassimiliano/";
  const frames = [
    { href: "street-study.html", image: "street-01.webp", title: "Street Study, the group on the staircase", ratio: 1.5, size: .17, x: -0.32, y: -0.29 },
    { href: "amore-tossico.html", image: "amore-03.webp", title: "Amore Tossico, portrait", ratio: .8, size: .093, x: -0.17, y: -0.1 },
    { href: "cuvee-semaine.html", image: "cuvee-semaine-landing-threshold.png", film: "cuvee-semaine-landing-threshold.mp4", title: "Cuvée Semaine, film", ratio: 1450/1080, size: .155, x: 0.44, y: -0.28 },
    { href: "insecto.html", image: "insecto-r0003077-164.webp", title: "Insecto, striped portrait", ratio: 2/3, size: .10, x: 0.29, y: 0.34 },
    { href: "amore-tossico.html", image: "amore-tossico-landing-threshold.png", film: "amore-tossico-landing-threshold.mp4", title: "Amore Tossico, runway film", ratio: 16/9, size: .18, x: -0.28, y: 0.32 },
    { href: "cuvee-semaine.html", image: "cuvee-03.webp", title: "Cuvée Semaine, print detail", ratio: .75, size: .08, x: -0.71, y: -0.06 },
    { href: "street-study.html", image: "street-03.webp", title: "Street Study, figure in front of a mural", ratio: .8, size: .12, x: 0.7, y: 0.57 },
    { href: "insecto.html", image: "insecto-02.webp", title: "Insecto, upside-down portrait", ratio: 907/1360, size: .115, x: 0, y: 0.78 },
    { href: "amore-tossico.html", image: "runway-01.webp", title: "Amore Tossico, view of the runway show", ratio: 1.5, size: .185, x: 0.35, y: -0.66 },
    { href: "amore-tossico.html", image: "amore-02.webp", title: "Amore Tossico, framed portrait", ratio: .8, size: .10, x: -0.62, y: -0.67 },
    { href: "ammassimiliano.html", folder: massimiliano, image: "che-cose-infimalega-landing-threshold.png", film: "che-cose-infimalega-landing-threshold.mp4", title: "A Massimiliano, presentation film", ratio: 4/3, size: .145, x: 0.34, y: 0.045 },
    { href: "ammassimiliano.html", folder: massimiliano, image: "pica-9.webp", title: "A Massimiliano, portrait of Pica", ratio: .8, size: .10, x: -0.40, y: 0.025 },
    { href: "ammassimiliano.html", folder: massimiliano, image: "rubina-10.webp", title: "A Massimiliano, portrait of Rubina", ratio: .8, size: .11, x: -0.41, y: 0.67 },
  ];

  const thermal = document.getElementById("thermal-film");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)");
  // The repeat distances, staggered coordinates and zoom bounds leave an image center in every viewport.
  const period = { x: 1.60, y: 1.62 };
  const wrap = (value, length) => value - length * Math.floor(value / length + .5);
  const limitZoom = value => Math.min(1.4, Math.max(.86, value));
  const playing = new Set();
  const tiles = [];
  const pointers = new Map();
  const camera = { x: 0, y: 0, zoom: 1 };
  const target = { ...camera };
  const nudge = { x: 0, y: 0 };
  let mouse = null, stageBounds, hoverUntil = 0, lastDraw = 0;
  let active = false;
  let suspended = false;
  let dragged = false;
  let width = 0, height = 0;
  let field, raf = 0;

  function running() {
    return active && !suspended && Boolean(document && !document.hidden);
  }

  // Keep the JPEG on screen until the inline player has produced a drawable frame.
  const thermalFrame = thermal.closest(".thermal-frame");
  const reloadDelays = [750, 2200];
  const nativeSource = thermal.getAttribute("src") || thermal.querySelector("source[src]")?.src;
  let blobUrl, sourceRequest;
  let thermalActive, gestureRequired = false, playRequest = 0;
  let frameRequest = null, frameGeneration = 0, watchdog = 0, reloadTimer = 0, reloads = 0;
  let clockStart = 0, playbackStarted = false, nextManualReload = 0;

  function cancelFrameProbe() {
    ++frameGeneration;
    if (frameRequest !== null) thermal.cancelVideoFrameCallback?.(frameRequest);
    frameRequest = null;
  }

  function showStill() {
    cancelFrameProbe();
    thermalFrame.classList.remove("has-video-frame");
    clockStart = thermal.currentTime;
    playbackStarted = false;
  }

  function showVideo() {
    if (!running() || thermal.paused || thermal.error || thermal.seeking) return;
    thermalFrame.classList.add("has-video-frame");
    clearTimeout(watchdog);
    clearTimeout(reloadTimer);
    watchdog = reloadTimer = 0;
    cancelFrameProbe();
  }

  function checkProgress() {
    if (!watchdog && thermalFrame.classList.contains("has-video-frame")) return;
    if (playbackStarted && thermal.readyState >= 2 && thermal.videoWidth && thermal.videoHeight &&
        Math.abs(thermal.currentTime - clockStart) >= .06) showVideo();
  }

  function probeFrame() {
    if (!running() || frameRequest !== null || thermalFrame.classList.contains("has-video-frame") ||
        typeof thermal.requestVideoFrameCallback !== "function") return;
    const generation = frameGeneration;
    try {
      frameRequest = thermal.requestVideoFrameCallback((now, metadata) => {
        if (generation !== frameGeneration) return;
        frameRequest = null;
        if ((metadata?.width || thermal.videoWidth) && (metadata?.height || thermal.videoHeight)) showVideo();
      });
    } catch {
      // Some embedded players expose the API but only report playback through media events.
      frameRequest = null;
    }
  }

  function scheduleReload() {
    if (!running() || gestureRequired || reloadTimer || reloads >= reloadDelays.length) return;
    reloadTimer = setTimeout(() => {
      reloadTimer = 0;
      if (!running() || gestureRequired) return;
      ++reloads;
      if (reloads === reloadDelays.length && !blobUrl && nativeSource &&
          /^https?:$/.test(location.protocol) && window.fetch && URL.createObjectURL) {
        recoverFullFile();
      } else reloadThermal();
    }, reloadDelays[reloads]);
  }

  function watchForStall(delay) {
    if (!running() || gestureRequired || watchdog || reloadTimer) return;
    const initialTime = thermal.currentTime;
    watchdog = setTimeout(() => {
      watchdog = 0;
      if (!running() || gestureRequired) return;
      if (!thermal.error && !thermal.paused && thermal.readyState >= 2 &&
          thermal.videoWidth && thermal.videoHeight && Math.abs(thermal.currentTime - initialTime) >= .06) {
        showVideo();
        return;
      }
      showStill();
      scheduleReload();
    }, delay);
  }

  function playThermal() {
    if (!running()) return;
    const request = ++playRequest;
    probeFrame();
    watchForStall(9000);
    const result = thermal.play();
    result?.then(() => {
      if (request !== playRequest || !running()) return;
      playbackStarted = true;
      checkProgress();
    }).catch(error => {
      if (request !== playRequest || !running() || error.name === "AbortError") return;
      if (error.name === "NotAllowedError") {
        gestureRequired = true;
        clearTimeout(watchdog);
        watchdog = 0;
        showStill();
      } else {
        showStill();
        scheduleReload();
      }
    });
  }

  function reloadThermal() {
    clearTimeout(watchdog);
    watchdog = 0;
    showStill();
    thermal.load();
    playThermal();
  }

  async function recoverFullFile() {
    // A whole-file fallback also works on hosts that cannot serve the player's byte ranges.
    const request = new AbortController();
    sourceRequest = request;
    const timeout = setTimeout(() => request.abort(), 60000);
    try {
      const response = await fetch(nativeSource, { mode: "same-origin", signal: request.signal });
      if (!response.ok) throw new Error("Film unavailable");
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty film");
      if (sourceRequest !== request || !running()) return;
      blobUrl = URL.createObjectURL(blob.slice(0, blob.size, "video/mp4"));
      thermal.src = blobUrl;
    } catch {
      // Restricted fetch or offline playback can still use the original media URL.
    } finally {
      clearTimeout(timeout);
      if (sourceRequest === request) {
        sourceRequest = null;
        if (running()) reloadThermal();
      }
    }
  }

  function syncThermal() {
    if (thermalActive === running()) return;
    thermalActive = running();
    if (!thermalActive && sourceRequest) {
      sourceRequest.abort();
      sourceRequest = null;
      --reloads; // The visibility change interrupted the fallback before it reached the player.
    }
    ++playRequest;
    clearTimeout(watchdog);
    clearTimeout(reloadTimer);
    watchdog = reloadTimer = 0;
    showStill();
    if (thermalActive) {
      gestureRequired = false;
      playbackStarted = !thermal.paused && thermal.readyState >= 3;
      thermal.muted = thermal.defaultMuted = thermal.playsInline = true;
      playThermal();
    } else thermal.pause();
  }

  thermal.addEventListener("playing", () => {
    if (!running()) return;
    playbackStarted = true;
    gestureRequired = false;
    clockStart = thermal.currentTime;
    probeFrame();
  });
  thermal.addEventListener("timeupdate", checkProgress);
  thermal.addEventListener("emptied", () => {
    showStill();
    probeFrame();
    watchForStall(9000);
  });
  // Source selection errors can fire on a <source> child without bubbling.
  thermal.addEventListener("error", () => {
    showStill();
    scheduleReload();
  }, true);
  for (const name of ["waiting", "stalled", "pause"]) {
    thermal.addEventListener(name, () => {
      if (name !== "pause" && thermal.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        showStill();
        probeFrame();
      }
      clockStart = thermal.currentTime;
      watchForStall(4500);
    });
  }

  function setPlayback(video, enabled) {
    if (!video) return;
    if (enabled && !playing.has(video)) {
      playing.add(video);
      video.play()?.catch(() => {}); // Keep the poster if the browser restricts autoplay.
    } else if (!enabled && (playing.delete(video) || !video.paused)) {
      video.pause();
    }
  }

  function retryPausedPlayback() {
    if (!running()) return;
    // A native gesture can unlock an autoplay-restricted player even after automatic retries ended.
    const exhausted = reloads >= reloadDelays.length && !thermalFrame.classList.contains("has-video-frame");
    const needsLoad = thermal.error || thermal.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || exhausted;
    if (!sourceRequest && !reloadTimer && needsLoad && Date.now() >= nextManualReload) {
      nextManualReload = Date.now() + 2500;
      gestureRequired = false;
      if (blobUrl && thermal.error) {
        thermal.src = nativeSource;
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      reloadThermal();
    } else if (thermal.paused || gestureRequired) {
      gestureRequired = false;
      playThermal();
    }
    for (const video of playing) {
      if (video.paused) video.play()?.catch(() => {});
    }
  }

  function addTile(frame) {
    const link = document.createElement("a");
    link.href = frame.href;
    link.className = "stage-tile";
    link.draggable = false;
    link.tabIndex = -1;
    link.setAttribute("aria-label", frame.title + ". Open the collection");
    const mediaFolder = frame.folder ?? folder;
    let media;
    if (frame.film) {
      link.classList.add("stage-film-tile");
      media = document.createElement("video");
      media.muted = true;
      media.defaultMuted = true;
      media.playsInline = true;
      media.loop = true;
      media.preload = "none";
      media.disablePictureInPicture = true;
      media.disableRemotePlayback = true;
      media.poster = mediaFolder + frame.image;
      media.src = mediaFolder + frame.film;
      media.setAttribute("aria-label", frame.title);
    } else {
      media = new Image();
      media.alt = frame.title;
      media.decoding = "async";
      media.draggable = false;
      media.src = mediaFolder + frame.image;
    }
    link.append(media);
    field.append(link);
    tiles.push({ frame, link, video: frame.film ? media : null });
  }

  function layout() {
    if (!width || !height) return;
    const base = Math.min(1600, Math.max(width, height * .78));
    let nearest, minDistance = Infinity;
    let hit, eventHit, hitCount = 0;
    const scaleX = (stageBounds.width || width) / width;
    const scaleY = (stageBounds.height || height) / height;
    const focusX = mouse ? mouse.x - stageBounds.left - width * scaleX / 2 : 0;
    const focusY = mouse ? mouse.y - stageBounds.top - height * scaleY / 2 : 0;
    for (const tile of tiles) {
      const { frame, link, video } = tile;
      const dx = wrap(frame.x + camera.x, period.x) * width * camera.zoom + nudge.x;
      const dy = wrap(frame.y + camera.y, period.y) * height * camera.zoom + nudge.y;
      const w = Math.min(frame.size * base, .29 * width, .28 * height * frame.ratio) * camera.zoom;
      const h = w / frame.ratio;
      const left = width / 2 + dx - w / 2;
      const top = height / 2 + dy - h / 2;
      if (tile.width !== w) {
        tile.width = w;
        link.style.width = w + "px";
        link.style.height = h + "px";
      }
      link.style.transform = `translate3d(${left}px,${top}px,0)`;
      const visible = left < width && top < height && left + w > 0 && top + h > 0;
      link.tabIndex = visible ? 0 : -1;
      setPlayback(video, visible && running());
      if (!visible) continue;
      const mx = dx * scaleX - focusX;
      const my = dy * scaleY - focusY;
      const distance = mx * mx + my * my;
      if (distance < minDistance) {
        minDistance = distance;
        nearest = link;
      }
      if (mouse && Math.abs(mx) <= w * scaleX / 2 && Math.abs(my) <= h * scaleY / 2) {
        ++hitCount;
        if (link === mouse.link) eventHit = link;
        // The focused tile currently paints in front; equal layers paint in document order.
        if (!hit?.classList.contains("is-near")) hit = link;
      }
    }
    if (hitCount > 1) {
      // Only overlapping bounds need a browser hit test. It reflects the transforms just applied.
      const top = document.elementFromPoint?.(mouse.x, mouse.y)?.closest(".stage-tile");
      hit = top && field.contains(top) ? top : eventHit || hit;
    }
    const focused = hit || nearest;
    for (const { link } of tiles) link.classList.toggle("is-near", link === focused);
  }

  function moveNudge(now) {
    if (!stageBounds || !width || !height || reducedMotion.matches) {
      nudge.x = nudge.y = 0;
      return false;
    }
    const pulse = mouse && now < hoverUntil;
    const nx = pulse ? (mouse.x - stageBounds.left) / (stageBounds.width || width) * 2 - 1 : 0;
    const ny = pulse ? (mouse.y - stageBounds.top) / (stageBounds.height || height) * 2 - 1 : 0;
    const factor = 10 / Math.max(1, Math.hypot(nx, ny));
    const goalX = nx * factor, goalY = ny * factor;
    const dt = lastDraw ? Math.min(50, now - lastDraw) : 16;
    const ease = 1 - Math.exp(-dt / (pulse ? 52 : 95));
    nudge.x += (goalX - nudge.x) * ease;
    nudge.y += (goalY - nudge.y) * ease;
    if (!pulse && Math.hypot(nudge.x, nudge.y) < .04) nudge.x = nudge.y = 0;
    return nudge.x !== 0 || nudge.y !== 0;
  }

  function draw(now = performance.now()) {
    raf = 0;
    if (!running()) return;
    let moving = moveNudge(now);
    for (const key of Object.keys(camera)) {
      const delta = target[key] - camera[key];
      if (Math.abs(delta) > .0002 && !reducedMotion.matches) {
        camera[key] += delta * .26;
        moving = true;
      } else camera[key] = target[key];
    }
    layout();
    lastDraw = moving ? now : 0;
    if (moving) schedule();
  }

  function schedule() {
    if (!raf && running()) raf = requestAnimationFrame(draw);
  }

  function measure() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    stageBounds = stage.getBoundingClientRect();
    layout();
  }

  function pan(dx, dy) {
    if (!width || !height) return;
    target.x += dx / (width * target.zoom);
    target.y += dy / (height * target.zoom);
    schedule();
  }

  function pinchDistance() {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clearHover(snap) {
    if (!mouse && !nudge.x && !nudge.y) return;
    mouse = null;
    if (snap) nudge.x = nudge.y = 0;
    layout();
    if (!snap && (nudge.x || nudge.y)) schedule();
  }

  function hover(event) {
    if (!running() || !fineHover.matches || event.pointerType !== "mouse" || event.buttons || pointers.size) return;
    const link = event.target.closest(".stage-tile");
    const moved = !mouse || mouse.x !== event.clientX || mouse.y !== event.clientY;
    if (!moved && mouse.link === link) return;
    if (moved) hoverUntil = performance.now() + 130;
    mouse = { x: event.clientX, y: event.clientY, link };
    schedule();
  }

  function pointerDown(event) {
    clearHover(true);
    if (!running() || event.button !== 0) return;
    dragged = pointers.size > 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    (event.target.closest(".stage-tile") || field).setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    const point = pointers.get(event.pointerId);
    if (!point) {
      hover(event);
      return;
    }
    if (!running()) return;
    if (!dragged && Math.hypot(event.clientX - point.startX, event.clientY - point.startY) <= 6) return;
    dragged = true;
    const distance = pointers.size === 2 ? pinchDistance() : 0;
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    point.x = event.clientX;
    point.y = event.clientY;
    if (distance > 0) {
      target.zoom = limitZoom(target.zoom * pinchDistance() / distance);
      pan(dx / 2, dy / 2);
    } else pan(dx, dy);
  }

  function wheel(event) {
    if (!running() || event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    const dy = event.shiftKey ? 0 : event.deltaY;
    pan(-dx * unit, -dy * unit);
  }

  function keypan(event) {
    if (!running() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const screen = stage.closest("#film");
    if (event.target !== document.body && event.target !== screen && !stage.contains(event.target)) return;
    retryPausedPlayback();
    const direction = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    pan(direction[0] * width * .24, direction[1] * height * .24);
  }

  function createScene() {
    field = document.createElement("div");
    field.className = "stage-field";
    field.tabIndex = 0;
    field.setAttribute("role", "group");
    field.setAttribute("aria-label", "Collection photographs and films. Use the arrow keys to explore.");
    stage.append(field);
    frames.forEach(addTile);
    field.addEventListener("pointerleave", () => clearHover(false));
    field.addEventListener("pointercancel", () => clearHover(true));
    field.addEventListener("pointerdown", pointerDown);
    field.addEventListener("pointermove", pointerMove);
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      field.addEventListener(name, event => pointers.delete(event.pointerId));
    }
    field.addEventListener("pointerup", retryPausedPlayback);
    field.addEventListener("wheel", wheel, { passive: false });
    field.addEventListener("click", event => {
      if (event.detail && dragged && event.target.closest(".stage-tile")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("keydown", keypan);
    fineHover.addEventListener?.("change", () => { if (!fineHover.matches) clearHover(true); });
    reducedMotion.addEventListener?.("change", schedule);
    new ResizeObserver(measure).observe(stage);
  }

  function sync() {
    cancelAnimationFrame(raf);
    raf = lastDraw = 0;
    syncThermal();
    if (!field) return;
    if (running()) measure();
    else {
      clearHover(true);
      for (const tile of tiles) setPlayback(tile.video, false);
      pointers.clear();
    }
  }

  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", event => {
    suspended = true;
    sync();
    if (blobUrl && !event.persisted) URL.revokeObjectURL(blobUrl);
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted || suspended) {
      dragged = false;
      clearHover(true);
    }
    suspended = false;
    sync();
  });
  window.filmStage = {
    activate() {
      if (!field) createScene();
      active = true;
      stage.inert = false;
      sync();
    },
    deactivate() {
      active = false;
      stage.inert = true;
      sync();
    }
  };
})();
