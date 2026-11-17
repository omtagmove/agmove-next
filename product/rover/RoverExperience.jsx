"use client";
import React, { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { STAGES } from "./stages.js";
import { sampleFlow } from "./flow.js";
import FarmBackdrop from "./FarmBackdrop.jsx";

const RoverCanvas = lazy(() => import("./RoverCanvas.jsx"));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

import { assessGraphics } from "./graphics.js";

class CanvasBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Client-only React component. Can also be imported into a Next.js client wrapper. */
export default function RoverExperience({ initialAssets }) {
  const section = useRef(null);
  const pin = useRef(null);
  const navigation = useRef(null);
  const motion = useRef({ progress: 0 });
  const trigger = useRef(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState(() => (window.agmoveRoverMode === "3d" ? "3d" : "poster"));
  const [reason, setReason] = useState(() => window.agmoveRoverMode || "loading");
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState("illustration");
  const [assets] = useState(initialAssets || { model: null });
  const [revision, setRevision] = useState(0);
  const stage = STAGES[active];

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 1023px)");
    const assess = () => {
      const result = assessGraphics();
      setReason(result);
      setMode(result === "3d" ? "3d" : "poster");
      setReady(false);
    };
    assess();
    reduced.addEventListener("change", assess);
    mobile.addEventListener("change", assess);
    const host = section.current.closest("#rover-experience");
    if (host) host.dataset.loading = "false";
    document.documentElement.classList.remove("rover-boot-3d");
    return () => {
      reduced.removeEventListener("change", assess);
      mobile.removeEventListener("change", assess);
    };
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (mode !== "3d") {
      trigger.current = null;
      return;
    }
    const indexMotion = { progress: 0 };
    motion.current.progress = 0;
    section.current?.style.setProperty("--attachment-title-opacity", "0");
    // Measure the pin synchronously on desktop resizes. Otherwise GSAP can
    // defer its resize refresh while the page's smooth scrolling is active.
    const rootStyle = document.documentElement.style;
    let scrollStyle, resizeTimer;
    const prepareMeasurement = () => {
      scrollStyle ??= [
        rootStyle.getPropertyValue("scroll-behavior"),
        rootStyle.getPropertyPriority("scroll-behavior"),
      ];
      rootStyle.setProperty("scroll-behavior", "auto", "important");
    };
    const finishMeasurement = () => {
      if (!scrollStyle) return;
      if (scrollStyle[0]) rootStyle.setProperty("scroll-behavior", ...scrollStyle);
      else rootStyle.removeProperty("scroll-behavior");
      scrollStyle = undefined;
    };
    const refreshAfterResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 180);
    };
    ScrollTrigger.addEventListener("refreshInit", prepareMeasurement);
    ScrollTrigger.addEventListener("refresh", finishMeasurement);
    window.addEventListener("resize", refreshAfterResize);
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          id: "agmove-five-jobs",
          trigger: section.current,
          pin: pin.current,
          start: "top top",
          // Spread all five stages over three times the scroll distance.
          end: () => `+=${Math.max(innerHeight * 18, 12600)}`,
          scrub: 0.8,
          // Demand rendering needs the final settled frame after GSAP's scrub tween.
          onScrubComplete: () => section.current?.dispatchEvent(new Event("rover-invalidate")),
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
      timeline.to(indexMotion, {
        progress: 1,
        duration: 1,
        ease: "none",
        onUpdate: () => {
          motion.current.progress = indexMotion.progress;
          const { index, textOpacity } = sampleFlow(indexMotion.progress);
          section.current?.style.setProperty("--attachment-title-opacity", String(textOpacity));
          section.current?.dispatchEvent(new Event("rover-invalidate"));
          if (index !== activeRef.current) {
            activeRef.current = index;
            setActive(index);
          }
        },
      });
      trigger.current = timeline.scrollTrigger;
    }, section);
    const host = section.current;
    if (new URLSearchParams(location.search).has("rover-review")) {
      host.__roverScroll = () => ({
        progress: trigger.current?.progress,
        scrubbing: Boolean(trigger.current?.getTween()?.isActive()),
      });
    }
    const refresh = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      delete host.__roverScroll;
      cancelAnimationFrame(refresh);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", refreshAfterResize);
      ScrollTrigger.removeEventListener("refreshInit", prepareMeasurement);
      ScrollTrigger.removeEventListener("refresh", finishMeasurement);
      finishMeasurement();
      trigger.current = null;
      context.revert();
    };
  }, [mode, revision]);

  useEffect(() => {
    if (!navigation.current) return;
    if (mode !== "3d")
      navigation.current.style.setProperty(
        "--rover-progress",
        String((active + 1) / STAGES.length),
      );
    const nav = navigation.current.querySelector("nav");
    const button = nav?.querySelectorAll("button")[active];
    if (button)
      nav.scrollTo({
        left: button.offsetLeft - nav.clientWidth / 2 + button.offsetWidth / 2,
        behavior: reason === "reduced" ? "instant" : "smooth",
      });
  }, [active, mode, reason]);

  const select = (index) => {
    index = clamp(index, 0, STAGES.length - 1);
    activeRef.current = index;
    setActive(index);
  };
  const fallback = () => {
    setReason("weak");
    setMode("poster");
    setReady(false);
  };
  const enable3d = () => {
    activeRef.current = 0;
    setActive(0);
    setReason("3d");
    setReady(false);
    setMode("3d");
    setRevision((value) => value + 1);
  };

  return (
    <section
      ref={section}
      className={`rover-experience ${mode === "3d" ? "is-3d" : "is-poster"}`}
      data-mode={mode}
      data-ready={ready}
      data-stage={stage.id}
      data-model={source}
      aria-label="Rover and attachment experience"
    >
      <div className="rover-pin" ref={pin}>
        {mode === "3d" && <FarmBackdrop active={active} />}
        <div className="rover-display" aria-label={`${stage.title} visualization`}>
          {mode === "poster" && (
            <img
              className="rover-poster"
              src={`/implements/assembled/${stage.implement}.webp`}
              width="969"
              height="1200"
              alt={`AgMove rover configured with ${stage.title}`}
            />
          )}
          {mode === "3d" && (
            <CanvasBoundary onFailure={fallback}>
              <Suspense fallback={null}>
                <RoverCanvas
                  assets={assets}
                  motion={motion}
                  eventTarget={section}
                  onReady={() => setReady(true)}
                  onFailure={fallback}
                  onSource={setSource}
                />
              </Suspense>
            </CanvasBoundary>
          )}
          {mode === "3d" && !ready && (
            <p className="rover-loading" role="status">
              Loading 3D view<span aria-hidden="true">…</span>
            </p>
          )}
          <span className="rover-model-note">
            {mode === "3d" && source !== "model"
              ? "Illustrative platform & implements"
              : "AgMove modular platform"}
          </span>
        </div>
        {mode === "3d" && ready && (
          <div className="rover-attachment-title" aria-live="polite" aria-atomic="true">
            <h3 aria-label={stage.title}>
              {stage.titleLines.map((line, index) => (
                <React.Fragment key={line}>
                  {index > 0 && " "}
                  <span>{line}</span>
                </React.Fragment>
              ))}
            </h3>
            <p className="rover-description">{stage.description}</p>
          </div>
        )}
        {mode === "poster" && (
          <div className="rover-stage-content" aria-live="polite" aria-atomic="true">
            {STAGES.map((item, index) => (
              <article
                key={item.id}
                className={`rover-stage-panel ${index === active ? "is-active" : ""}`}
                hidden={index !== active}
              >
                <p className="rover-step">{String(index + 1).padStart(2, "0")} / 05</p>
                <h3>{item.title}</h3>
                <p className="rover-description">{item.description}</p>
                <div className="rover-stats" aria-hidden="true" />
                <p className="rover-conditions" aria-hidden="true" />
              </article>
            ))}
          </div>
        )}
        {mode === "poster" && (
          <div
            className="rover-navigation"
            ref={navigation}
            style={{ "--rover-progress": (active + 1) / STAGES.length }}
          >
            <div
              className="rover-progress"
              role="progressbar"
              aria-label="Product story progress"
              aria-valuemin={1}
              aria-valuemax={STAGES.length}
              aria-valuenow={active + 1}
              aria-valuetext={`${active + 1} of ${STAGES.length}: ${stage.short}`}
            >
              <span />
            </div>
            <nav
              className="rover-stage-navigation"
              aria-label="Choose an attachment"
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 4
                      : clamp(active + (event.key === "ArrowRight" ? 1 : -1), 0, 4);
                select(index);
                event.currentTarget
                  .querySelectorAll("button")
                  [index].focus({ preventScroll: true });
              }}
            >
              {STAGES.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  data-job={item.id}
                  aria-pressed={index === active}
                  aria-current={index === active ? "step" : undefined}
                  className={index < active ? "is-complete" : undefined}
                  onClick={() => select(index)}
                >
                  <span className="rover-nav-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.short}
                </button>
              ))}
            </nav>
          </div>
        )}
        {mode === "poster" && reason === "weak" && (
          <button className="rover-enable" type="button" onClick={enable3d}>
            Explore in 3D <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </section>
  );
}
