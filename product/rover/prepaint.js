import { assessGraphics } from "./graphics.js";
const root = document.documentElement;
try {
  window.agmoveAssessRoverGraphics = assessGraphics;
  const mode = assessGraphics();
  window.agmoveRoverMode = mode;
  if (mode !== "small") root.classList.add("rover-js-desktop");
  if (mode === "3d") root.classList.add("rover-boot-3d");
} catch {
  /* Without enhancement, the complete HTML fallback stays visible. */
}
// A missing entry script must not leave the fallback hidden forever.
if (window.agmoveRoverMode === "3d")
  window.agmoveRoverBootTimer = setTimeout(() => {
    root.classList.remove("rover-boot-3d", "rover-js-desktop");
    window.agmoveRoverBootExpired = true;
  }, 30000);
