import { useEffect, useRef } from "react";

// Loading screen: the coaster drawn as a design sketch on green, its ring filling in as the 3D
// scene loads, with Bezier handles, dashed construction lines and a soft glow. Once loaded, the
// ring opens to the coaster's proportions and fades out over the hero. A port of the original's.

const BEZIER = ((Math.SQRT2 - 1) * 4) / 3;
const MIN_DURATION = 1;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fit = (
  v: number,
  a: number,
  b: number,
  c: number,
  d: number,
  ease?: (t: number) => number,
) => {
  let t = clamp01((v - a) / (b - a));
  if (ease) t = ease(t);
  return c + (d - c) * t;
};
const backOut = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const sineOut = (t: number) => Math.sin((t * Math.PI) / 2);

export function Preloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;

    const glow = document.createElement("canvas");
    glow.width = glow.height = 255;
    const g = glow.getContext("2d");
    if (g) {
      const gradient = g.createRadialGradient(127.5, 127.5, 0, 127.5, 127.5, 128);
      gradient.addColorStop(0, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gradient;
      g.fillRect(0, 0, 255, 255);
    }

    let loaded = false;
    const onReady = () => {
      loaded = true;
    };
    window.addEventListener("oryzo:ready", onReady);
    // Never hold the page hostage: give up waiting after a while.
    const fallback = window.setTimeout(onReady, 15000);
    document.documentElement.style.overflow = "hidden";

    let time = 0;
    let percent = 0;
    let exit = 0;
    let last = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += dt;
      // Progress runs up to 90% on its own, the last part once the scene is ready.
      const target = loaded ? 1 : 0.9;
      percent = Math.min(target, percent + dt / MIN_DURATION);
      if (percent >= 1) exit = Math.min(1, exit + dt / 1.2);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const mobile = w < 768;
      const fade = 1 - exit;
      const outer = h * 0.21 * (mobile ? 0.72 : 1) * fit(time, 0.2, 0.7, 0.2, 1, backOut);
      const inner =
        outer *
        fit(exit, 0, 0.3, 239 / 520, 466 / 536, sineOut) *
        fit(time, 0.2, 0.9, 0.2, 1, backOut);
      const circumference = outer * 2 * Math.PI;
      const dash = circumference / 300;
      const spin = (time / Math.max(1, circumference)) * 100;
      const top = -Math.PI / 2;
      const half = h / 2;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2 + (mobile ? h * 0.03 : 0));
      ctx.lineWidth = 2;
      ctx.setLineDash([dash, dash]);

      // The filled part of the ring shows progress.
      ctx.fillStyle = "#ffedd7";
      ctx.globalAlpha = fade * fit(time, 0.5, 1, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0, outer), top, Math.PI * 2 * percent + top);
      ctx.arc(0, 0, Math.max(0, inner), Math.PI * 2 * percent + top, top, true);
      ctx.closePath();
      ctx.fill();

      // Construction lines through the edges of both circles, faded by a radial glow.
      ctx.strokeStyle = "#ffedd7";
      ctx.globalAlpha = fade;
      ctx.beginPath();
      for (const r of [-outer, -inner, inner, outer]) {
        ctx.moveTo(r, -half);
        ctx.lineTo(r, half);
        ctx.moveTo(-half, r);
        ctx.lineTo(half, r);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-in";
      ctx.drawImage(glow, -half, -half, h, h);
      ctx.globalCompositeOperation = "source-over";

      // Dashed outlines of both circles, slowly turning.
      ctx.strokeStyle = "#FDCA83";
      ctx.globalAlpha = 1 - exit;
      for (const r of [outer, inner]) {
        ctx.save();
        ctx.rotate(spin);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Orange Bezier handles at the four quadrant points of each circle.
      const handleOuter = outer * BEZIER;
      const handleInner = inner * BEZIER;
      ctx.strokeStyle = ctx.fillStyle = "#FF8539";
      ctx.setLineDash([]);
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.rotate((Math.PI / 2) * i);
        ctx.moveTo(outer, -handleOuter);
        ctx.lineTo(outer, handleOuter);
        ctx.moveTo(inner, -handleInner);
        ctx.lineTo(inner, handleInner);
      }
      ctx.stroke();
      ctx.restore();
      const big = (5 * h) / 1080;
      const small = (3 * h) / 1080;
      ctx.save();
      for (let i = 0; i < 4; i++) {
        ctx.rotate((Math.PI / 2) * i);
        ctx.beginPath();
        ctx.arc(inner, -handleInner, small, 0, Math.PI * 2);
        ctx.arc(inner, handleInner, small, 0, Math.PI * 2);
        ctx.rect(inner - small, -small, small * 2, small * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(outer, -handleOuter, big, 0, Math.PI * 2);
        ctx.arc(outer, handleOuter, big, 0, Math.PI * 2);
        ctx.rect(outer - big, -big, big * 2, big * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();

      // The green ground dissolves as the ring opens, revealing the hero underneath.
      root.style.backgroundColor = `rgba(75, 92, 61, ${(1 - fit(exit, 0, 0.6, 0, 1)).toFixed(3)})`;
      if (exit >= 1) {
        root.style.display = "none";
        document.documentElement.style.overflow = "";
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      window.removeEventListener("oryzo:ready", onReady);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <div className="oz-preloader" ref={rootRef} role="progressbar" aria-label="Loading Oryzo">
      <canvas ref={canvasRef} />
    </div>
  );
}
