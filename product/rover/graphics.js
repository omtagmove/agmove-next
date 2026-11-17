/** A shared pre-paint/runtime decision; small screens never probe WebGL. */
export function assessGraphics() {
  if (matchMedia("(max-width: 1023px)").matches) return "small";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced";
  if (
    navigator.connection?.saveData ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    navigator.hardwareConcurrency <= 2
  )
    return "weak";
  const canvas = document.createElement("canvas");
  try {
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      const relaxed = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
      relaxed?.getExtension("WEBGL_lose_context")?.loseContext();
      return relaxed ? "weak" : "unsupported";
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|software|llvmpipe/i.test(renderer) ? "weak" : "3d";
  } catch {
    return "unsupported";
  }
}
