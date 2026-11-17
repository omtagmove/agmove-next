// Small screens keep the HTML poster and native attachment accordion. No React/GSAP/3D import.
const host = document.querySelector("#rover-experience");
if (host) {
  const desktop = matchMedia("(min-width: 1024px)");
  const fallback = host.innerHTML;
  let started = false,
    unmount,
    observer,
    generation = 0;
  const reveal = () => {
    clearTimeout(window.agmoveRoverBootTimer);
    window.agmoveRoverBootTimer = 0;
    document.documentElement.classList.remove("rover-boot-3d");
    host.dataset.loading = "false";
  };
  const start = async () => {
    if (started || !desktop.matches) return;
    started = true;
    const version = ++generation;
    host.dataset.loading = "true";
    if (window.agmoveRoverMode === "3d" && !window.agmoveRoverBootTimer) {
      window.agmoveRoverBootTimer = setTimeout(() => {
        window.agmoveRoverBootExpired = true;
        document.documentElement.classList.remove("rover-js-desktop");
        reveal();
      }, 30000);
    }
    try {
      const [{ mountRoverExperience }, assets] = await Promise.all([
        import("./mount.jsx"),
        fetch("/models/rover-assets.json")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (version !== generation || !desktop.matches) return;
      if (window.agmoveRoverBootExpired) {
        document.documentElement.classList.remove("rover-js-desktop");
        reveal();
        return;
      }
      clearTimeout(window.agmoveRoverBootTimer);
      unmount = mountRoverExperience(host, assets);
    } catch {
      if (version !== generation || !desktop.matches) return;
      reveal();
      document.documentElement.classList.remove("rover-js-desktop");
      host.dataset.mode = "static";
    }
  };
  const configure = () => {
    observer?.disconnect();
    if (!desktop.matches) {
      generation++;
      window.agmoveRoverMode = "small";
      window.agmoveRoverBootExpired = false;
      unmount?.();
      unmount = undefined;
      if (started) host.innerHTML = fallback;
      started = false;
      reveal();
      document.documentElement.classList.remove("rover-js-desktop");
      return;
    }
    if (!started) {
      if (!window.agmoveRoverMode || window.agmoveRoverMode === "small")
        window.agmoveRoverMode = window.agmoveAssessRoverGraphics?.() || "unsupported";
      document.documentElement.classList.add("rover-js-desktop");
      document.documentElement.classList.toggle(
        "rover-boot-3d",
        window.agmoveRoverMode === "3d" && !window.agmoveRoverBootExpired,
      );
    }
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            start();
          }
        },
        { rootMargin: "350px" },
      );
      observer.observe(host);
    } else start();
  };
  desktop.addEventListener("change", configure);
  configure();
}
