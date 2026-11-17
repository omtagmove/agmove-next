/** Shared navigation; applications now live on the homepage. */
function initNavigation() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const nav = header.querySelector(".site-nav");
  const toggle = header.querySelector(".menu-toggle");
  const close = () => {
    nav.classList.remove("open");
    header.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    nav.classList.toggle("open", open);
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) close();
  });
  header.addEventListener("focusout", () =>
    queueMicrotask(() => {
      if (!header.contains(document.activeElement)) close();
    }),
  );
  matchMedia("(min-width:1101px)").addEventListener("change", close);
  const sync = () => header.classList.toggle("is-scrolled", scrollY > 24);
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

if (typeof document !== "undefined") {
  initNavigation();
  /* Preserve query parameters and fragments for legacy .html bookmarks. */
  const destination = document.querySelector("#redirect-target");
  if (destination) {
    const target = new URL(destination.href);
    target.search = window.location.search;
    if (window.location.hash) target.hash = window.location.hash;
    window.location.replace(target.href);
  }
}
