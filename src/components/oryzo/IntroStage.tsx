import { useEffect, useRef, useState } from "react";

import { WearableHeadline, WearableLayer, WEARABLE_ITEMS } from "@/components/oryzo/WearableLayer";
import { cubicIn, cubicOut, fit, type OryzoStage, type StageFrame } from "@/lib/oryzo3d/stage";

const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sineInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const backIn = (t: number) => 2.70158 * t * t * t - 1.70158 * t * t;

const TITLE = "Powered by AI";
const PRE_TITLE = ["isn’t just", "a coaster."];

export function OryzoLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 809 174" role="img" aria-label="Oryzo">
      <path
        fill="currentColor"
        d="M87 174.007C36 174.007 0 132.007 0 87.007C0 42.007 36 0.00697267 87 0.00697267C138 0.00697267 174 42.007 174 87.007C174 132.007 138 174.007 87 174.007ZM87 135.007C112 135.007 135 114.988 135 87.007C135 59.0264 112 39.007 87 39.007C62 39.007 39 59.0264 39 87.007C39 114.988 62 135.007 87 135.007Z"
      />
      <path
        fill="currentColor"
        d="M196.21 170.007V3.64971H263.618C307.624 3.64971 327.21 27.5604 327.21 60.6284C327.21 84.0304 317.29 103.108 295.923 112.011L333.315 170.007H284.476L254.969 117.861H237.418V170.007H196.21ZM237.418 79.7061H264.126C280.66 79.7061 285.493 71.5663 285.493 60.6284C285.493 49.6905 280.66 41.8051 264.126 41.8051H237.418V79.7061Z"
      />
      <path
        fill="currentColor"
        d="M385.705 170.007V101.073L324.911 3.64971H373.495L406.309 62.1546L439.122 3.64971H486.689L426.913 99.8012V170.007H385.705Z"
      />
      <path
        fill="currentColor"
        d="M490.688 170.007V133.124L567.762 41.8051H494.503V3.64971H619.907V40.5333L542.834 131.852H622.451V170.007H490.688Z"
      />
      <path
        fill="currentColor"
        d="M722 174C671 174 635 132 635 87C635 42 671 0 722 0C773 0 809 42 809 87C809 132 773 174 722 174ZM722 135C747 135 770 114.981 770 87C770 59.0194 747 39 722 39C697 39 674 59.0194 674 87C674 114.981 697 135 722 135Z"
      />
    </svg>
  );
}

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

    // The wearable gallery runs on its own clock: rw is viewport heights since it scrolled into view.
    const applyWearable = (rw: number) => {
      const set = (name: string, value: number) => root.style.setProperty(name, value.toFixed(4));
      const hide = fit(rw, 12.25, 13.25, 0, 1);
      const active = rw > 0 && hide < 1;
      root.dataset["wear"] = active ? "on" : "off";
      if (!active) {
        for (const video of videos) if (video && !video.paused) video.pause();
        return;
      }
      set("--wear-hide", hide);
      set("--wear-label", rw - 0.5);
      set("--wear-big-x", fit(rw, 1, 2, 100, 0));
      set("--wear-big-on", rw >= 1 ? 1 : 0);
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
      set("--mag-zoom", fit(rw, 10.9, 13.1, 0, 1, cubicInOut));
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
    };

    void import("@/lib/oryzo3d/stage").then(({ OryzoStage }) => {
      if (cancelled) return;
      stage = new OryzoStage(canvas);
      stage.onFrame = applyFrame;
      stage.onReady = () => setReady(true);
    });

    return () => {
      cancelled = true;
      stage?.dispose();
    };
  }, []);

  return (
    <section className="oz-stage-track" id="intro" ref={rootRef} data-ready={ready}>
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
      </div>
    </section>
  );
}
