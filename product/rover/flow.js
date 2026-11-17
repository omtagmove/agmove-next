/** The entire journey is sampled from scroll, including tool actions and wheel travel.
 * No elapsed-time state: seeking or scrolling backwards produces the same scene. */
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => {
  const x = clamp01(n);
  return clamp01(x * x * x * (x * (x * 6 - 15) + 10));
};
const speed = (n) => {
  if (n <= 0 || n >= 1) return 0;
  return (30 * n * n * (1 - n) * (1 - n)) / 1.875;
};
export const stageStop = (index, count = 5) => (index + 0.54) / count;

export function sampleFlow(progress, count = 5) {
  const position = clamp01(progress) * count;
  const index = Math.min(count - 1, Math.floor(position));
  const local = position - index;
  let distance = 8 * smooth(position / 0.18);
  let moving = speed(position / 0.18);
  for (let stop = 1; stop < count; stop++) {
    const t = (position - stop + 0.18) / 0.36;
    distance += 16 * smooth(t);
    moving = Math.max(moving, speed(t));
  }
  const exit = (position - count + 0.18) / 0.18;
  distance += 8 * smooth(exit);
  // A calmer pace: wheels, terrain and bounce cover 40% less ground per scroll.
  distance *= 0.6;
  moving = Math.max(moving, speed(exit));
  const arrival = smooth((local - 0.2) / 0.14);
  const departure = index === count - 1 ? 0 : smooth((local - 0.72) / 0.1);
  const dock = arrival * (1 - departure);
  const actionProgress = clamp01((local - 0.36) / 0.34);
  const action = Math.sin(Math.PI * actionProgress) ** 2;
  // Keep the same flank visible throughout the journey, including reverse scrolling.
  const heading = -0.35;
  const opacity =
    smooth((local - 0.2) / 0.06) * (index === count - 1 ? 1 : 1 - smooth((local - 0.76) / 0.06));
  return {
    index,
    local,
    dock,
    distance,
    moving,
    heading,
    action,
    actionProgress,
    bounce: moving
      ? moving * (Math.sin(distance * 5.2) * 0.018 + Math.sin(distance * 9.1) * 0.008)
      : 0,
    roll: moving ? moving * Math.sin(distance * 3.4) * 0.008 : 0,
    visible: opacity > 0.001,
    opacity,
    textOpacity:
      smooth((local - 0.16) / 0.1) * (index === count - 1 ? 1 : 1 - smooth((local - 0.78) / 0.08)),
    phase:
      local < 0.18
        ? "arriving"
        : local < 0.34
          ? "docking"
          : local < 0.72
            ? "working"
            : local < 0.82 && index !== count - 1
              ? "undocking"
              : local >= 0.82
                ? "departing"
                : "working",
  };
}
// Coordinates measured against normalized rover: X across, Y up, +Z forward.
// Deck source top 0.744 m, source floor -0.014 m, display scale about 2.32.
export const MOUNTS = {
  arms: [0, 1.755, -0.05],
  spraying: [0, 1.755, -0.28],
  hitch: [0, 1.755, -0.98],
  trolley: [0, 0, -1.93],
  trey: [0, 1.755, -0.2],
};
