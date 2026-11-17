/** Local photographs are requested only after the desktop 3D experience starts. */
import { useEffect, useState } from "react";

const SCENES = [
  ["mango-orchard", "50% 55%"],
  ["vineyard-road", "50% 55%"],
  ["wheat-field", "50% 75%"],
  ["loading-yard", "50% 100%"],
  ["distribution-floor", "50% 60%"],
];

export default function FarmBackdrop({ active }) {
  const [loaded, setLoaded] = useState({});
  const [requested, setRequested] = useState(() => new Set([active]));
  useEffect(() => {
    // Fetch the current image first, then warm its neighbours. Keep decoded
    // images for backward scrolling; never replace a visible image's src.
    setRequested((previous) => {
      const next = new Set(previous).add(active);
      if (loaded[active]) {
        if (active > 0) next.add(active - 1);
        if (active < SCENES.length - 1) next.add(active + 1);
      }
      return next.size === previous.size ? previous : next;
    });
  }, [active, loaded]);
  return (
    <div
      className="rover-farm-backdrop"
      aria-hidden="true"
      data-loaded={Object.keys(loaded).length > 0}
    >
      {SCENES.map(
        ([name, position], i) =>
          requested.has(i) && (
            <img
              key={name}
              className="rover-farm-photo"
              data-scene={i}
              data-loaded={!!loaded[i]}
              src={`/assets/product/${name}.webp`}
              alt=""
              decoding="async"
              style={{
                objectPosition: position,
                opacity: loaded[i] ? `var(--farm-scene-${i}, ${i === 0 ? 1 : 0})` : 0,
              }}
              onLoad={async (event) => {
                const image = event.currentTarget;
                try {
                  await image.decode();
                } catch {
                  /* onLoad already guarantees usable pixels. */
                }
                setLoaded((previous) => ({ ...previous, [i]: true }));
              }}
            />
          ),
      )}
    </div>
  );
}
