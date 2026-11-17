/** Original SVG illustration, progressively enhanced within this section only. */
const section = document.querySelector("#layered-autonomy");

if (section) {
  const svg = section.querySelector(".la-svg");
  const layers = [...section.querySelectorAll(".la-layer")].sort(
    (a, b) => Number(a.dataset.laLayer) - Number(b.dataset.laLayer),
  );
  const labels = [...section.querySelectorAll(".la-labels li")];
  const buttons = labels.map((label) => label.querySelector("button"));
  const pauseButton = section.querySelector(".la-pause");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = matchMedia("(min-width: 1024px) and (min-height: 700px)");
  const narrow = matchMedia("(max-width: 1023px)");
  let active = 0,
    paused = false,
    visible = false,
    context,
    timeline,
    generation = 0;
  let ticking;
  const progress = section.querySelector("[data-la-progress]");
  let mission = 64;

  function setActive(index) {
    active = index;
    layers.forEach((layer, i) => layer.classList.toggle("is-active", i === index));
    labels.forEach((label, i) => {
      label.classList.toggle("is-active", i === index);
      buttons[i].setAttribute("aria-pressed", String(i === index));
    });
    section.dataset.activeLayer = String(index);
  }

  function syncPlayback() {
    const playing = visible && !paused && !reduced.matches && !narrow.matches && !document.hidden;
    section.classList.toggle("la-playing", playing);
    clearInterval(ticking);
    if (playing) {
      ticking = setInterval(() => {
        if (active === 0) {
          mission = mission >= 72 ? 64 : mission + 1;
          progress.textContent = `${mission}%`;
        }
      }, 1600);
    }
  }

  // Reuse the site's local distribution. Failure leaves the static diagram usable.
  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => (ready() ? resolve() : reject(Error("Animation library unavailable")));
      script.onerror = reject;
      document.head.append(script);
    });
  }
  let libraries;
  const loadLibraries = () =>
    (libraries ||= loadScript("/assets/vendor/gsap.min.js", () => window.gsap).then(() =>
      loadScript("/assets/vendor/ScrollTrigger.min.js", () => window.ScrollTrigger),
    ));

  function reset() {
    context?.revert();
    context = timeline = undefined;
    section.classList.remove("la-enhanced", "la-scroll");
    svg.setAttribute("viewBox", "-210 -12 910 932");
    layers.forEach((layer, i) => {
      layer.setAttribute("transform", `translate(0 ${25 + i * 180})`);
      layer.classList.remove("is-active");
    });
    labels.forEach((label, i) => {
      label.classList.remove("is-active");
      buttons[i].removeAttribute("aria-pressed");
      buttons[i].disabled = true;
    });
    pauseButton.hidden = true;
  }

  async function configure() {
    const version = ++generation;
    reset();
    if (reduced.matches || narrow.matches) {
      if (narrow.matches) svg.setAttribute("viewBox", "-210 -12 750 932");
      syncPlayback();
      return;
    }
    buttons.forEach((button) => (button.disabled = false));
    section.classList.add("la-enhanced");
    pauseButton.hidden = false;
    setActive(active);
    if (desktop.matches && !paused) {
      try {
        await loadLibraries();
      } catch {
        syncPlayback();
        return;
      }
      if (version !== generation) return;
      const { gsap, ScrollTrigger } = window;
      gsap.registerPlugin(ScrollTrigger);
      section.classList.add("la-scroll");
      context = gsap.context(() => {
        // Instant measurements prevent the site's smooth anchor scrolling from
        // moving the page while ScrollTrigger recalculates its pin after resize.
        const rootStyle = document.documentElement.style;
        let scrollStyle;
        const prepareMeasurement = () => {
          scrollStyle ??= [
            rootStyle.getPropertyValue("scroll-behavior"),
            rootStyle.getPropertyPriority("scroll-behavior"),
          ];
          rootStyle.setProperty("scroll-behavior", "auto", "important");
          section.style.setProperty(
            "--la-pin-top",
            `${document.querySelector(".site-header").getBoundingClientRect().bottom + 12}px`,
          );
        };
        const finishMeasurement = () => {
          if (!scrollStyle) return;
          if (scrollStyle[0]) rootStyle.setProperty("scroll-behavior", ...scrollStyle);
          else rootStyle.removeProperty("scroll-behavior");
          scrollStyle = undefined;
        };
        ScrollTrigger.addEventListener("refreshInit", prepareMeasurement);
        ScrollTrigger.addEventListener("refresh", finishMeasurement);
        let resizeTimer;
        const refreshAfterResize = () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 180);
        };
        window.addEventListener("resize", refreshAfterResize);
        prepareMeasurement();
        // Wrappers preserve the SVG's static exploded positions for no-JS and reduced motion.
        const offsets = layers.map((layer) => layer.querySelector(".la-offset"));
        const connectors = section.querySelectorAll(".la-connector");
        gsap.set(offsets, { y: (i) => (2 - i) * 158 });
        gsap.set(connectors, { opacity: 0 });
        timeline = gsap.timeline({
          scrollTrigger: {
            id: "layered-autonomy",
            trigger: section,
            start: () =>
              `top ${parseFloat(section.style.getPropertyValue("--la-pin-top")) - parseFloat(getComputedStyle(section).paddingTop)}px`,
            end: () => `+=${Math.round(innerHeight * 2.4)}`,
            pin: section.querySelector(".la-inner"),
            scrub: 0.45,
            invalidateOnRefresh: true,
          },
          onUpdate() {
            const time = this.time();
            setActive(Math.min(4, Math.max(0, Math.floor(time - 1.2))));
          },
        });
        timeline
          .to(offsets, { y: 0, duration: 1.2, ease: "power2.inOut" }, 0)
          .to(connectors, { opacity: 1, duration: 0.35 }, 0.85)
          .to({}, { duration: 5 });
        finishMeasurement();
        return () => {
          clearTimeout(resizeTimer);
          window.removeEventListener("resize", refreshAfterResize);
          ScrollTrigger.removeEventListener("refreshInit", prepareMeasurement);
          ScrollTrigger.removeEventListener("refresh", finishMeasurement);
          finishMeasurement();
        };
      }, section);
    }
    syncPlayback();
  }

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      if (timeline?.scrollTrigger && !paused) {
        const trigger = timeline.scrollTrigger;
        const position = (1.7 + index) / timeline.duration();
        window.scrollTo({
          top: trigger.start + (trigger.end - trigger.start) * position,
          behavior: "instant",
        });
        timeline.progress(position);
      }
      setActive(index);
    });
    button.addEventListener("keydown", (event) => {
      const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let target;
      if (event.key in moves) target = (index + moves[event.key] + 5) % 5;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = 4;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].focus({ preventScroll: true });
      buttons[target].click();
    });
  });
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Resume animation" : "Pause animation";
    pauseButton.setAttribute("aria-pressed", String(paused));
    // Pausing also reveals the full stack and releases the scroll pin.
    if (paused && context) {
      context.revert();
      context = timeline = undefined;
      section.classList.remove("la-scroll");
    } else if (!paused) {
      configure();
    }
    syncPlayback();
  });
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    },
    { threshold: 0.05 },
  ).observe(section);
  document.addEventListener("visibilitychange", syncPlayback);
  [reduced, desktop, narrow].forEach((query) => query.addEventListener("change", configure));
  configure();
}
