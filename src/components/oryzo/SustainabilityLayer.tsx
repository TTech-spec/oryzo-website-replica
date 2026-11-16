import { useEffect, useRef } from "react";

/**
 * Copy over the sustainability scene (the giant title itself is drawn by the 3D layer).
 * Reads --sus-a / --sus-b / --sus-ink from the stage's scroll timeline.
 */
export function SustainabilityLayer() {
  return (
    <div className="oz-sus">
      <p className="oz-sus-tagline">100% Plant-based</p>
      <div className="oz-sus-title">
        <h4 className="oz-sus-pre">Vegan-friendly</h4>
        <h2 className="oz-sus-main">sustainability</h2>
      </div>
      <p className="oz-sus-desc">
        Pure cork sourced sustainably.
        <br />
        Completely vegan - no cows were harmed,
        <br />
        but it might be full of &quot;bull&quot;sh*t.
      </p>
    </div>
  );
}

/** One artboard of the stats animation file, started when it scrolls into view. */
function RiveCanvas({ artboard, className }: { artboard: string; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};
    void import("@rive-app/canvas").then(({ Rive, Layout, Fit, Alignment }) => {
      if (disposed) return;
      const rive = new Rive({
        src: "/oryzo/rive/oryzo.riv",
        canvas,
        artboard,
        stateMachines: "State Machine 1",
        autoplay: false,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => rive.resizeDrawingSurfaceToCanvas(),
      });
      const onResize = () => rive.resizeDrawingSurfaceToCanvas();
      window.addEventListener("resize", onResize);
      // Play each time the card comes into view.
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              rive.reset({ artboard, stateMachines: "State Machine 1", autoplay: true });
              rive.resizeDrawingSurfaceToCanvas();
            }
          }
        },
        { threshold: 0.35 },
      );
      observer.observe(canvas);
      cleanup = () => {
        observer.disconnect();
        window.removeEventListener("resize", onResize);
        rive.cleanup();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [artboard]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

/** The three sustainability facts, on cream, following the pinned scene. */
export function SustainabilityStats() {
  return (
    <section className="oz-stats" data-light-header>
      <div className="oz-stats-grid">
        <article className="oz-stat is-feature">
          <h3>
            Average
            <br />
            age of first
            <br />
            harvest
          </h3>
          <p>
            Cork oaks are typically first harvested at around 25 years, once the bark is thick
            enough to remove safely.
          </p>
          <span className="oz-stat-num" aria-hidden="true">
            25
          </span>
        </article>
        <article className="oz-stat">
          <h4>
            Harvesting
            <br />
            interval
          </h4>
          <RiveCanvas artboard="harvesting" className="oz-stat-rive is-full" />
          <p>
            After each harvest, the bark takes about 9 years to regrow, making cork a renewable
            material.
          </p>
        </article>
        <article className="oz-stat">
          <h4>
            Power draw
            <br />
            while in use
          </h4>
          <RiveCanvas artboard="text" className="oz-stat-rive" />
          <p>
            No compute. No tokens. So you can say “please” and “thank you” as much as you want,
            guilt free.
          </p>
        </article>
      </div>
    </section>
  );
}
