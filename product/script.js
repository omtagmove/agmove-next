import "../shared/script.js";

// Native disclosure controls preserve keyboard operation and a no-JavaScript fallback.
const attachments = [...document.querySelectorAll("[data-attachment]")];
attachments.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (item.open)
      attachments.forEach((other) => {
        if (other !== item) other.open = false;
      });
  });
});
function revealAttachment() {
  const aliases = { "#product-towed": "#product-trolley", "#product-onboard": "#product-tray" };
  const hash = aliases[location.hash] ?? location.hash;
  const item = attachments.find((attachment) => `#${attachment.id}` === hash);
  if (!item) return;
  item.open = true;
  requestAnimationFrame(() => item.scrollIntoView({ behavior: "instant", block: "start" }));
}
addEventListener("hashchange", revealAttachment);
addEventListener("load", revealAttachment);
document.fonts.ready.then(revealAttachment);
