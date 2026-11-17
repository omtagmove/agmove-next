import "../shared/script.js";

import initFleetDemo from "./tablet/script.js";

/* Robot image carousel */
/** Live-site rover carousel with manual, swipe, and accessible autoplay controls. */
function initAboutCarousel() {
  const root = document.querySelector("#aboutCarousel");
  if (!root) return;
  const slides = [...root.querySelectorAll(".about-carousel-slide")];
  const pause = root.parentElement.querySelector(".about-carousel-pause");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController(),
    { signal } = controller;
  let current = 0,
    timer = null,
    exitTimer = null,
    paused = false,
    hovered = false,
    focused = false,
    visible = false,
    start = null;
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  function play() {
    stop();
    if (!paused && !hovered && !focused && !document.hidden && visible && !motion.matches)
      timer = setInterval(() => go(current + 1), 1500);
  }
  function go(index) {
    const next = (index + slides.length) % slides.length;
    root.dataset.dir = index < current ? "backward" : "forward";
    clearTimeout(exitTimer);
    slides.forEach((slide) => slide.classList.remove("exit"));
    slides[current].classList.remove("active");
    slides[current].classList.add("exit");
    current = next;
    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === current);
      slide.setAttribute("aria-hidden", String(i !== current));
    });
    exitTimer = setTimeout(() => slides.forEach((slide) => slide.classList.remove("exit")), 700);
  }
  slides.forEach((slide, i) => {
    slide.setAttribute("aria-hidden", String(i !== 0));
    slide.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
  });
  pause.hidden = false;
  pause.addEventListener(
    "click",
    () => {
      paused = !paused;
      pause.textContent = paused ? "Play" : "Pause";
      pause.setAttribute("aria-pressed", String(paused));
      pause.setAttribute("aria-label", paused ? "Play rover slideshow" : "Pause rover slideshow");
      play();
    },
    { signal },
  );
  root.querySelector(".prev").addEventListener(
    "click",
    () => {
      go(current - 1);
      play();
    },
    { signal },
  );
  root.querySelector(".next").addEventListener(
    "click",
    () => {
      go(current + 1);
      play();
    },
    { signal },
  );
  root.addEventListener(
    "keydown",
    (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      go(current + (e.key === "ArrowLeft" ? -1 : 1));
      play();
    },
    { signal },
  );
  root.parentElement.addEventListener(
    "mouseenter",
    () => {
      hovered = true;
      stop();
    },
    { signal },
  );
  root.parentElement.addEventListener(
    "mouseleave",
    () => {
      hovered = false;
      play();
    },
    { signal },
  );
  root.parentElement.addEventListener(
    "focusin",
    () => {
      focused = true;
      stop();
    },
    { signal },
  );
  root.parentElement.addEventListener(
    "focusout",
    () =>
      queueMicrotask(() => {
        focused = root.parentElement.contains(document.activeElement);
        play();
      }),
    { signal },
  );
  root.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      stop();
    },
    { passive: true, signal },
  );
  root.addEventListener(
    "touchend",
    (e) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x,
        dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.1) go(current + (dx < 0 ? 1 : -1));
      start = null;
      play();
    },
    { passive: true, signal },
  );
  root.addEventListener(
    "touchcancel",
    () => {
      start = null;
      play();
    },
    { passive: true, signal },
  );
  document.addEventListener("visibilitychange", play, { signal });
  motion.addEventListener("change", play, { signal });
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      play();
    },
    { threshold: 0.1 },
  );
  observer.observe(root);
  const cleanup = () => {
    stop();
    clearTimeout(exitTimer);
    observer.disconnect();
    controller.abort();
  };
  window.addEventListener(
    "pagehide",
    (e) => {
      if (!e.persisted) cleanup();
    },
    { signal },
  );
  return cleanup;
}

/* Agriculture and industry slider */
/** Two supplied photographs share one composition; only the diagonal reveal moves. */
function initEnvironmentSplit() {
  const section = document.querySelector(".environment-split");
  if (!section) return;
  const pin = section.querySelector(".environment-pin");
  const scenes = [...section.querySelectorAll(".environment-scene")];
  const copies = scenes.map((scene) => scene.querySelector(".environment-copy"));
  const industrialPhoto = scenes[1].querySelector(".environment-photo");
  const divider = section.querySelector(".environment-divider");
  const button = section.querySelector(".environment-slide");
  const ring = section.querySelector(".environment-ring-progress");
  const controller = new AbortController();
  const { signal } = controller;
  let animation = null,
    navigation = null,
    progress = 0;
  button.hidden = false;
  const cancel = () => {
    navigation?.kill();
    navigation = null;
  };
  button.addEventListener(
    "click",
    () => {
      if (!animation) return scenes[1].scrollIntoView({ behavior: "auto", block: "start" });
      const trigger = animation.scrollTrigger;
      const target = progress < 0.5 ? trigger.end : trigger.start;
      cancel();
      const scroll = { y: scrollY };
      navigation = window.gsap.to(scroll, {
        y: target,
        duration: 0.85,
        ease: "power2.inOut",
        onUpdate: () => window.scrollTo({ top: scroll.y, behavior: "instant" }),
        onComplete: () => {
          navigation = null;
        },
      });
    },
    { signal },
  );
  window.addEventListener("wheel", cancel, { passive: true, signal });
  window.addEventListener("touchstart", cancel, { passive: true, signal });
  window.addEventListener(
    "keydown",
    (event) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key))
        cancel();
    },
    { signal },
  );
  if (!matchMedia("(min-width: 1024px)").matches || !window.gsap || !window.ScrollTrigger)
    return () => controller.abort();
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  let media = gsap.matchMedia();
  const query = "(prefers-reduced-motion: no-preference) and (min-height: 560px)";
  const setup = () => {
    section.classList.add("is-enhanced");
    const phase = { value: 0 };
    let currentState = -1;
    function render() {
      progress = phase.value;
      const edge = 112 - 124 * progress;
      gsap.set(industrialPhoto, {
        clipPath: `polygon(${edge + 12}% 0, 100% 0, 100% 100%, ${edge - 12}% 100%)`,
      });
      const angle = (Math.atan((pin.clientWidth * 0.24) / pin.clientHeight) * 180) / Math.PI;
      gsap.set(divider, {
        left: `${edge}%`,
        skewX: -angle,
        opacity: progress > 0.005 && progress < 0.995 ? 1 : 0,
      });
      gsap.set(ring, { strokeDashoffset: 289.027 * (1 - progress) });
      const state = progress < 0.5 ? 0 : 1;
      if (currentState !== state) {
        const initial = currentState < 0;
        currentState = state;
        gsap.killTweensOf(copies);
        if (initial) {
          gsap.set(copies, { autoAlpha: 0, y: 0 });
          gsap.set(copies[state], { autoAlpha: 1 });
        } else {
          gsap.to(copies[1 - state], { autoAlpha: 0, y: -14, duration: 0.18, overwrite: true });
          gsap.fromTo(
            copies[state],
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: 0.38, delay: 0.1, ease: "power2.out", overwrite: true },
          );
        }
        scenes.forEach((scene, i) => {
          scene.inert = i !== state;
          scene.setAttribute("aria-hidden", String(i !== state));
        });
        button.setAttribute("aria-pressed", String(state === 1));
        button.setAttribute(
          "aria-label",
          state === 0 ? "Show industrial environment" : "Show agricultural environment",
        );
      }
    }
    animation = gsap.to(phase, {
      value: 1,
      ease: "none",
      onUpdate: render,
      scrollTrigger: {
        trigger: section,
        start: () => section.getBoundingClientRect().top + window.scrollY,
        end: () => `+=${section.offsetHeight - pin.offsetHeight}`,
        scrub: 0.65,
        invalidateOnRefresh: true,
        onRefresh: render,
      },
    });
    render();
    return () => {
      cancel();
      gsap.killTweensOf(copies);
      animation = null;
      progress = 0;
      [industrialPhoto, divider, ring, ...copies].forEach((element) =>
        element.removeAttribute("style"),
      );
      scenes.forEach((scene) => {
        scene.inert = false;
        scene.removeAttribute("aria-hidden");
      });
      section.classList.remove("is-enhanced");
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Show industrial environment");
    };
  };
  media.add(query, setup);
  const refresh = () => ScrollTrigger.refresh();
  document.fonts.ready.then(() => {
    if (!signal.aborted) refresh();
  });
  window.addEventListener("pageshow", refresh, { signal });
  const cleanup = () => {
    cancel();
    media.revert();
    controller.abort();
  };
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) cleanup();
    },
    { signal },
  );
  return cleanup;
}

/* Industry applications */
/** A pinned portrait stage with scroll-linked image wipes and thumbnail rails. */
function initIndustryShowcase() {
  const section = document.querySelector(".industry-showcase");
  if (!section) return;
  const pin = section.querySelector(".industry-pin");
  const cards = [...section.querySelectorAll(".industry-card")];
  const images = cards.map((card) => card.querySelector(".industry-image"));
  const photos = images.map((image) => image.querySelector("img"));
  const copies = cards.map((card) => card.querySelector(".industry-copy"));
  const header = document.querySelector(".site-header");
  const controller = new AbortController();
  const { signal } = controller;
  let active = -1,
    media = null;
  const setPinned = (pinned) => {
    header?.classList.toggle("is-showcase-hidden", pinned);
    if (header) header.inert = pinned;
  };
  function select(index) {
    if (active === index) return;
    const previous = active;
    active = index;
    const enhanced = section.classList.contains("industry-enhanced");
    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === index);
      copies[i].inert = enhanced && i !== index;
    });
    if (enhanced) {
      const direction = previous < 0 || index >= previous ? 1 : -1;
      window.gsap.killTweensOf(copies);
      window.gsap.set(copies, { autoAlpha: 0, y: 0 });
      window.gsap.fromTo(
        copies[index],
        { autoAlpha: 0, y: 12 * direction },
        { autoAlpha: 1, y: 0, duration: 0.32, ease: "power2.out", overwrite: true },
      );
    }
  }
  if (!matchMedia("(min-width: 1024px)").matches || !window.gsap || !window.ScrollTrigger)
    return () => controller.abort();
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  media = gsap.matchMedia();
  media.add(
    "(min-width: 1000px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)",
    () => {
      section.classList.add("industry-enhanced");
      active = -1;
      const rails = ["before", "after"].map((side) => {
        const rail = document.createElement("div");
        rail.className = `industry-rail industry-rail--${side}`;
        rail.setAttribute("aria-hidden", "true");
        const strip = document.createElement("div");
        strip.className = "industry-rail-track";
        photos.forEach((photo) => {
          const thumb = document.createElement("div");
          thumb.className = "industry-thumbnail";
          const img = photo.cloneNode();
          img.alt = "";
          img.loading = "eager";
          img.draggable = false;
          thumb.append(img);
          strip.append(thumb);
        });
        rail.append(strip);
        pin.append(rail);
        return { rail, strip };
      });
      const frame = document.createElement("div");
      frame.className = "industry-stage-frame";
      frame.setAttribute("aria-hidden", "true");
      pin.append(frame);
      const offsets = () => {
        const thumb = rails[0].strip.firstElementChild;
        return {
          width: thumb.offsetWidth,
          stride: thumb.offsetWidth + parseFloat(getComputedStyle(rails[0].strip).gap),
        };
      };
      const phase = { position: 0 };
      function render() {
        const position = phase.position;
        const lower = Math.min(cards.length - 2, Math.floor(position));
        const blend = Math.min(1, position - lower);
        // The stage stays fixed. The incoming image reveals right-to-left while both
        // photographs drift subtly, avoiding a hard swap or an entire-card slide.
        images.forEach((image, i) => {
          const incoming = i === lower + 1;
          const visible = i === lower || incoming;
          gsap.set(image, {
            visibility: visible ? "visible" : "hidden",
            zIndex: incoming ? 2 : 1,
            clipPath: incoming ? `inset(0 0 0 ${(1 - blend) * 100}%)` : "inset(0 0 0 0)",
          });
          if (visible)
            gsap.set(photos[i], {
              xPercent: incoming ? (1 - blend) * 6 : -blend * 4,
              scale: incoming ? 1.1 - 0.1 * blend : 1 + 0.06 * blend,
            });
        });
        const { width, stride } = offsets();
        gsap.set(rails[0].strip, {
          x: rails[0].rail.clientWidth - width + stride - position * stride,
        });
        gsap.set(rails[1].strip, { x: -(position + 1) * stride });
        select(Math.round(position));
      }
      gsap.to(phase, {
        position: cards.length - 1,
        ease: "none",
        onUpdate: render,
        scrollTrigger: {
          trigger: section,
          pin,
          start: "top top",
          end: () => `+=${Math.round((cards.length - 1) * Math.max(250, innerHeight * 0.36))}`,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          snap: {
            snapTo: 1 / (cards.length - 1),
            inertia: false,
            duration: { min: 0.18, max: 0.45 },
            delay: 0.12,
            ease: "power2.inOut",
          },
          onToggle: (trigger) => setPinned(trigger.isActive),
          onRefresh: render,
        },
      });
      render();
      return () => {
        setPinned(false);
        gsap.killTweensOf(copies);
        [...images, ...photos, ...copies].forEach((element) => element.removeAttribute("style"));
        rails.forEach(({ rail }) => rail.remove());
        frame.remove();
        section.classList.remove("industry-enhanced");
        copies.forEach((copy) => {
          copy.inert = false;
        });
        active = -1;
        select(0);
      };
    },
  );
  const refresh = () => ScrollTrigger.refresh();
  document.fonts.ready.then(() => {
    if (!signal.aborted) refresh();
  });
  window.addEventListener("pageshow", refresh, { signal });
  const cleanup = () => {
    media.revert();
    controller.abort();
  };
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) cleanup();
    },
    { signal },
  );
  return cleanup;
}

initAboutCarousel();
initFleetDemo();
const desktopMotion = matchMedia("(min-width: 1024px)");
let effects,
  libraryLoading,
  motionGeneration = 0;
function loadMotionScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}
async function configureMotion() {
  const generation = ++motionGeneration;
  effects?.forEach((dispose) => dispose?.());
  // Keep the existing native environment button on small screens and while
  // libraries load; only its desktop scroll animation requires GSAP.
  effects = [initEnvironmentSplit()];
  if (!desktopMotion.matches) return;
  try {
    libraryLoading ||= loadMotionScript("/assets/vendor/gsap.min.js").then(() =>
      loadMotionScript("/assets/vendor/ScrollTrigger.min.js"),
    );
    await libraryLoading;
    if (desktopMotion.matches && generation === motionGeneration) {
      effects.forEach((dispose) => dispose?.());
      effects = [initEnvironmentSplit(), initIndustryShowcase()];
    }
  } catch {
    /* All sections retain their static layout if animation is unavailable. */
  }
}
desktopMotion.addEventListener("change", configureMotion);
configureMotion();
