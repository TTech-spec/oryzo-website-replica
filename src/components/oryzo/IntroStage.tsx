import { useEffect, useRef, useState } from "react";

import { FeaturesLayer } from "@/components/oryzo/FeaturesLayer";
import { OryzoLogo } from "@/components/oryzo/OryzoLogo";
import { WearableHeadline, WearableLayer, WEARABLE_ITEMS } from "@/components/oryzo/WearableLayer";
import type { CurveStudy } from "@/lib/oryzo3d/curveStudy";
import { cubicIn, cubicOut, fit, type OryzoStage, type StageFrame } from "@/lib/oryzo3d/stage";

const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sineInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const backIn = (t: number) => 2.70158 * t * t * t - 1.70158 * t * t;

const TITLE = "Powered by AI";
const PRE_TITLE = ["isn’t just", "a coaster."];

/**
 * The pinned opening sequence: desk hero -> "isn't just a coaster" -> "Powered by AI".
 * A single WebGL stage sits behind the copy; everything is driven by scroll position
 * measured in viewport heights (r), the same unit the baked camera animation uses.
 */
export function IntroStage({ onPlayFilm }: { onPlayFilm: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let stage: OryzoStage | undefined;
    let cancelled = false;
    let lastHero = -1;

    const items = Array.from(root.querySelectorAll<HTMLElement>(".oz-wear-item"));
    const inners = items.map((item) => item.querySelector<HTMLElement>(".oz-wear-item-inner"));
    const videos = items.map((item) => item.querySelector("video"));
    const last = WEARABLE_ITEMS.length - 1;
    const big = root.querySelector<HTMLElement>(".oz-wear-big");

    // The wearable gallery runs on its own clock: rw is viewport heights since it scrolled into view.
    const applyWearable = (rw: number) => {
      const set = (name: string, value: number) => root.style.setProperty(name, value.toFixed(4));
      const hide = fit(rw, 12.25, 13.25, 0, 1);
      const active = rw > 0 && hide < 1;
      root.dataset["wear"] = active ? "on" : "off";
      if (!active) {
        if (stage) stage.headline.opacity = 0;
        // Items carry their own visibility, which would otherwise override the hidden layer.
        for (const item of items)
          if (item.style.visibility !== "hidden") item.style.visibility = "hidden";
        for (const video of videos) if (video && !video.paused) video.pause();
        return;
      }
      set("--wear-hide", hide);
      set("--wear-label", rw - 0.5);
      set("--wear-big-x", fit(rw, 1, 2, 100, 0));
      // The headline is drawn by the 3D layer while it moves (so it can break up behind the
      // photo); the real text element takes over once it has settled into the title.
      const settled = rw >= 4.75;
      set("--wear-big-on", settled ? 1 : 0);
      if (stage && big) {
        const box = big.getBoundingClientRect();
        const origin = root.querySelector(".oz-stage")?.getBoundingClientRect();
        stage.headline.x = box.left - (origin?.left ?? 0);
        stage.headline.y = box.top - (origin?.top ?? 0);
        stage.headline.width = box.width;
        stage.headline.height = box.height;
        stage.headline.opacity = rw >= 1 && !settled ? 1 : 0;
      }
      set("--wear-shrink", fit(rw, 3.25, 4.75, 0, 1, cubicInOut));
      set("--frame-show", fit(rw, 0, 1, 0, 1));
      set("--frame-scale", fit(rw, 2.2, 3.4, 0, 1, cubicInOut));
      set("--intro-show", fit(rw, 4.7, 5.2, 0, 1));
      set("--thumbs", fit(rw, 4.6, 5.4, 0, 1) * fit(rw, 10.6, 11, 1, 0));

      // The gallery advances in steps: each image settles before the next one slides in.
      const raw = ((rw - 5.5) / 5.25) * last;
      const whole = Math.floor(raw);
      const index = Math.min(
        last,
        Math.max(0, whole + fit(raw - whole, 0.1, 0.9, 0, 1, sineInOut)),
      );
      set("--gallery-index", index);
      items.forEach((item, i) => {
        const isLast = i === last;
        const show = fit(index, i - 1, i, 0, 1);
        const gone = isLast ? 0 : fit(index, i, i + 1, 0, 1);
        const visible = show > 0 && gone < 1;
        item.style.visibility = visible ? "visible" : "hidden";
        if (visible) {
          const o = show - 1 + gone;
          const inner = inners[i];
          if (inner)
            inner.style.transform = `rotate(${o * -10}deg) scale(${1 + Math.abs(o) * 0.2})`;
        }
        const settled = visible && Math.abs(index - i) < 0.5;
        if (item.dataset["active"] !== String(settled)) item.dataset["active"] = String(settled);
        const video = videos[i];
        if (video) {
          if (visible && video.paused) void video.play().catch(() => {});
          else if (!visible && !video.paused) video.pause();
        }
      });

      // Magazine cover: copy flies off, then the frame opens up to fill the screen.
      const magHide = fit(raw - last, 0, 3.2, 0, 1);
      const a = fit(magHide, 0.5, 1, 0, 1);
      set("--mag-a", a);
      set("--mag-fly", cubicIn(a));
      set("--mag-num", fit(fit(a, 0, 0.75, 0, 1), 0, 1, 1, 0.1, backIn));
      set("--mag-zoom", 0);
    };

    const curveCanvas = root.querySelector<HTMLCanvasElement>(".oz-feat-curve");
    let curveStudy: CurveStudy | undefined;
    let lastCurveTime = performance.now();
    const panelWidth = () =>
      root.querySelector(".oz-feat-items")?.getBoundingClientRect().width ?? 0;
    const onResize = () => curveStudy?.resize();
    window.addEventListener("resize", onResize);
    const featureItems = Array.from(root.querySelectorAll<HTMLElement>(".oz-feat-item"));
    const featureExtras = Array.from(root.querySelectorAll<HTMLElement>(".oz-feat-extra"));

    // Features copy: each item fades in over 0.625 viewports, holds, and hands over to the next.
    const applyFeatures = (a: number) => {
      const active = a > 0 && a < 9.6;
      root.dataset["feat"] = active ? "on" : "off";
      // The roundness study runs on its own clock, starting as the third feature arrives.
      let curve = fit(a, 4.5, 5.125, 0, 1);
      curve = fit(a, 5.875, 7, curve, 2);
      curve = fit(a, 7, 8.5, curve, 3);
      curve = fit(a, 8.5, 10.5, curve, 4);
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastCurveTime) / 1000);
      lastCurveTime = now;
      curveStudy?.update(dt, active ? curve : 0, panelWidth());
      root.style.setProperty("--feat-logo", (active ? fit(curve, 2.5, 3, 0, 0.1) : 0).toFixed(4));
      if (!active) return;
      let first = 0;
      let lastOut = 0;
      featureItems.forEach((item, i) => {
        const start = 0.5 + i * 2;
        const show = fit(a, start, start + 0.625, 0, 1);
        const gone = fit(a, start + 1.375, start + 2, 0, 1);
        if (i === 0) first = show;
        lastOut = gone;
        const opacity = fit(show, 0, 0.5, 0, 1) * fit(gone, 0.5, 1, 1, 0);
        for (const el of [item, featureExtras[i]]) {
          if (!el) continue;
          el.style.setProperty("--in", cubicOut(show).toFixed(4));
          el.style.setProperty("--out", gone.toFixed(4));
          el.style.opacity = opacity.toFixed(4);
          el.style.visibility = opacity > 0 ? "visible" : "hidden";
        }
      });
      root.style.setProperty("--feat-panel", (cubicOut(first) * (1 - lastOut)).toFixed(4));
      // The temperature scale belongs to the second feature.
      root.style.setProperty(
        "--feat-slider",
        (fit(a, 2.5, 3.125, 0, 1) * fit(a, 3.875, 4.5, 1, 0)).toFixed(4),
      );
    };

    const applyFrame = ({ r, heroActive }: StageFrame) => {
      const set = (name: string, value: number) => root.style.setProperty(name, value.toFixed(4));
      set("--hero", heroActive);
      if (heroActive !== lastHero) {
        lastHero = heroActive;
        document.documentElement.style.setProperty("--oz-hero", heroActive.toFixed(4));
      }
      // "Isn't just a coaster" slides in from the sides, holds, then drifts out.
      const preIn = fit(r, 0.5, 1.25, 0, 1);
      const preOut = fit(r, 2.75, 3.5, 0, 1);
      set("--pre", preIn * (1 - preOut));
      set("--pre-x", fit(r, 0.5, 2, -1, 0, cubicOut) + fit(r, 2, 3.5, 0, 1, cubicIn));
      // "Powered by AI" reveals letter by letter.
      set("--title", fit(r, 4, 5, 0, 1) * fit(r, 8, 8.75, 1, 0));
      set("--title-out", fit(r, 8, 8.75, 0, 1));
      set("--desc", fit(r, 4.5, 5.5, 0, 1) * fit(r, 7.5, 8.5, 1, 0));
      set("--hint", fit(r, 5.5, 6, 0, 1) * fit(r, 7.5, 8, 1, 0));
      set("--note", fit(r, 1, 2, 0, 1) * fit(r, 8, 9, 1, 0));
      set("--glow", fit(r, 5.5, 6, 0, 1) * fit(r, 7.5, 8, 1, 0));
      set("--warm", fit(r, 3.5, 5.5, 0, 1));
      root.dataset["phase"] = heroActive > 0 ? "hero" : "ai";
      applyWearable(r - 8);
      applyFeatures(r - 21.25);
    };

    void import("@/lib/oryzo3d/curveStudy").then(({ CurveStudy }) => {
      if (cancelled || !curveCanvas) return;
      curveStudy = new CurveStudy(curveCanvas, "/oryzo/textures/");
    });
    void import("@/lib/oryzo3d/stage").then(({ OryzoStage }) => {
      if (cancelled) return;
      stage = new OryzoStage(canvas);
      stage.onFrame = applyFrame;
      stage.onReady = () => setReady(true);
    });

    return () => {
      cancelled = true;
      stage?.dispose();
      curveStudy?.dispose();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section className="oz-stage-track" id="intro" ref={rootRef} data-ready={ready}>
      {/* Scroll target for the Features nav link: where the first feature has faded in. */}
      <span id="features" className="oz-anchor" style={{ top: "2240vh" }} />
      <div className="oz-stage">
        <div className="oz-stage-bg" aria-hidden="true" />
        <WearableHeadline />
        <canvas className="oz-stage-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="oz-stage-glow" aria-hidden="true" />

        <div className="oz-hero">
          <p className="oz-hero-tagline">Made for mugs. Built for tables.</p>
          <OryzoLogo className="oz-hero-logo" />
          <p className="oz-hero-copy">
            Designed to lift, insulate, and grip in all the right ways. Oryzo makes the simplest
            moment feel considered.
          </p>
          <div className="oz-hero-card">
            <h4>
              Designed
              <br />
              by Lusion,
              <br />
              the award-winning
              <br />
              design studio.
            </h4>
            <div>
              <span className="oz-dashline" />
              <p>
                The world&apos;s most
                <br />
                unnecessarily
                <br />
                sophisticated cork coaster.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="oz-hero-video"
            onClick={onPlayFilm}
            aria-label="Play the Oryzo film"
          >
            <img src="/oryzo/images/video_thumb.webp" alt="" width={320} height={180} />
            <span>Play</span>
          </button>
          <div className="oz-scroll-hint">
            <span className="oz-scroll-hint-icon" aria-hidden="true" />
            Scroll to continue
          </div>
        </div>

        <div className="oz-ai">
          <div className="oz-ai-pre">
            <h2>
              {PRE_TITLE.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p>Oryzo isn’t just a coaster. It’s the result of unprecedented AI* breakthroughs.</p>
          </div>

          <div className="oz-ai-header">
            <h1 aria-label="Powered by AI*">
              {TITLE.split("").map((char, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  style={{ "--n": (index / (TITLE.length - 1)).toFixed(3) } as React.CSSProperties}
                >
                  {char === " " ? " " : char}
                </span>
              ))}
              <sup aria-hidden="true">*</sup>
            </h1>
            <span className="oz-ai-tagline">Oryzo-1</span>
          </div>

          <div className="oz-ai-hint">
            <span className="oz-ai-hint-icon" aria-hidden="true">
              ✋
            </span>
            <span className="oz-dashline" />
            <span>Try to hover hand</span>
          </div>

          <p className="oz-ai-desc">
            AI fills in the gaps.
            <br />
            We said high five.
            <br />
            It heard six.
          </p>

          <div className="oz-ai-note">
            <span className="oz-dashline" />
            <span>
              * Adobe
              <br />
              Illustrator
            </span>
          </div>
        </div>

        <WearableLayer />
        <FeaturesLayer />
      </div>
    </section>
  );
}
