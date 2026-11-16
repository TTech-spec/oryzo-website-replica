// The "Now 37.9% More Circular" study: a blueprint of the coaster drawn as four bezier quarter
// arcs with their control handles, with design sketches drifting around it. The circle then
// grows and splits into the two O's of the ORYZO wordmark.

const BEZIER_OFFSET = ((Math.sqrt(2) - 1) * 4) / 3;
const COASTER_INNER_SCALE = 0.8;
const LOGO_O_INNER_SCALE = 96 / 174;
const LOGO_REF_WIDTH = 1804;
const LOGO_REF_HEIGHT = 388;
const ORANGE = "#FF8539";

// Six sketches packed three to a sheet, one per colour channel.
export const SKETCHES = [
  { scale: 0.75, aspect: 1685 / 1035 },
  { scale: 1, aspect: 1239 / 1281 },
  { scale: 1, aspect: 1780 / 1473 },
  { scale: 0.75, aspect: 1602 / 864 },
  { scale: 0.75, aspect: 1557 / 848 },
  { scale: 1, aspect: 1133 / 1500 },
];
const SKETCH_ORDERS = [0, 3, 1, 4, 2, 5];

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
const backInOut = (t: number) => {
  const s = 1.70158 * 1.525;
  return t < 0.5
    ? ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2
    : ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
};
const backOut = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const expoInOut = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
const loop = (v: number, min: number, max: number) =>
  min + ((((v - min) % (max - min)) + (max - min)) % (max - min));

/**
 * Load the six design sketches. Each sheet packs three drawings, one per colour channel; each is
 * turned into an orange line drawing using its channel as alpha.
 */
export function loadSketches(
  texturePath: string,
  onSketch: (index: number, sketch: HTMLCanvasElement) => void,
) {
  const load = (url: string, first: number) => {
    const image = new Image();
    image.onload = () => {
      const source = document.createElement("canvas");
      source.width = image.width;
      source.height = image.height;
      const sctx = source.getContext("2d", { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(image, 0, 0);
      const pixels = sctx.getImageData(0, 0, image.width, image.height).data;
      for (let channel = 0; channel < 3; channel++) {
        const out = document.createElement("canvas");
        out.width = image.width;
        out.height = image.height;
        const octx = out.getContext("2d");
        if (!octx) continue;
        const data = octx.createImageData(image.width, image.height);
        for (let p = 0; p < pixels.length; p += 4) {
          data.data[p] = 255;
          data.data[p + 1] = 113;
          data.data[p + 2] = 37;
          data.data[p + 3] = pixels[p + channel] ?? 0;
        }
        octx.putImageData(data, 0, 0);
        onSketch(first + channel, out);
      }
    };
    image.src = url;
  };
  load(`${texturePath}sketches/sketches_a.png`, 0);
  load(`${texturePath}sketches/sketches_b.png`, 3);
}

export class CurveStudy {
  private ctx: CanvasRenderingContext2D | null;
  private quarter = document.createElement("canvas");
  private quarterCtx = this.quarter.getContext("2d");
  private glow = document.createElement("canvas");
  private sketches: (HTMLCanvasElement | null)[] = [null, null, null, null, null, null];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private time = 0;
  private sketchTime = 0;
  private sketchShow = 0;
  private pointer = { x: 0, y: 0 };
  private eased = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    texturePath: string,
  ) {
    this.ctx = canvas.getContext("2d");
    this.glow.width = this.glow.height = 255;
    const g = this.glow.getContext("2d");
    if (g) {
      const gradient = g.createRadialGradient(127.5, 127.5, 0, 127.5, 127.5, 128);
      gradient.addColorStop(0, "rgba(255,255,255,0.3)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gradient;
      g.fillRect(0, 0, 255, 255);
    }
    loadSketches(texturePath, (index, sketch) => {
      this.sketches[index] = sketch;
    });
    window.addEventListener("pointermove", this.onPointerMove);
    this.resize();
  }

  private onPointerMove = (event: PointerEvent) => {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
  };

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.ceil(this.width * this.dpr);
    this.canvas.height = Math.ceil(this.height * this.dpr);
    this.quarter.width = this.quarter.height = Math.ceil((this.height + 8) * this.dpr);
  }

  private drawQuarter(outer: number, inner: number, arcRatio: number) {
    const q = this.quarterCtx;
    if (!q) return;
    q.setTransform(1, 0, 0, 1, 0, 0);
    q.clearRect(0, 0, this.quarter.width, this.quarter.height);
    q.scale(this.dpr, this.dpr);
    q.lineWidth = 1;
    q.setLineDash([3, 3]);
    const curve = (r: number, k: number) => {
      // Marching dashes along the arc.
      const chord = Math.hypot(r, r);
      q.lineDashOffset = -(chord + 2 * k * 0.5) / 4 + this.time;
      q.beginPath();
      q.moveTo(r, 0);
      q.bezierCurveTo(r, k, k, r, 0, r);
      q.stroke();
    };
    const handle = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      radius: number,
      half: number,
    ) => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      q.beginPath();
      q.moveTo(mx, my);
      q.lineTo(x1, y1);
      q.moveTo(mx, my);
      q.lineTo(x2, y2);
      q.stroke();
      q.beginPath();
      q.arc(x1, y1, radius, 0, Math.PI * 2);
      q.arc(x2, y2, radius, 0, Math.PI * 2);
      q.rect(mx - half, my - half, half * 2, half * 2);
      q.fill();
    };
    const ko = outer * BEZIER_OFFSET * arcRatio;
    const ki = inner * BEZIER_OFFSET * arcRatio;
    q.strokeStyle = "#fff";
    curve(outer, ko);
    curve(inner, ki);
    q.strokeStyle = q.fillStyle = ORANGE;
    q.lineDashOffset = 0;
    handle(outer, -ko, outer, ko, 3, 4);
    handle(ko, outer, -ko, outer, 3, 4);
    handle(inner, -ki, inner, ki, 3, 3);
    handle(ki, inner, -ki, inner, 3, 3);
  }

  /**
   * @param t the study's clock: 0-1 appear, 1-1.5 move to centre, 1.5-2.5 grow, 2.25-3 split
   *   into the wordmark's O's, 3-3.5 fade
   * @param panelWidth width of the copy panel on the left that the drawing must stay clear of
   */
  update(dt: number, t: number, panelWidth: number) {
    const ctx = this.ctx;
    const show = fit(t, 0, 1, 0, 1) * (1 - fit(t, 3, 3.5, 0, 1));
    this.canvas.style.visibility = show > 0 ? "visible" : "hidden";
    if (!ctx || show <= 0) {
      this.sketchShow = 0;
      return;
    }
    this.canvas.style.opacity = String(show);
    this.time += dt;
    const { width, height, dpr } = this;
    const viewWidth = fit(t, 1, 1.5, width - panelWidth, width);
    const logoExpand = fit(t, 1.5, 2.5, 0, 1);
    const logoRatio = fit(t, 2.25, 3, 0, 1);
    // While it sits beside the copy the arcs "breathe" - the roundness being recalibrated.
    const arcRatio =
      1 +
      (Math.sin(this.time * 5) * 0.5 + 0.5) *
        0.4 *
        fit(t, 0.5, 0.75, 0, 1) *
        fit(t, 1.25, 1.5, 1, 0);

    const defaultOuter = height / 5 / 2;
    const logoOuter = (((width - width * 0.03125 * 2) / LOGO_REF_WIDTH) * LOGO_REF_HEIGHT) / 2;
    const outer = fit(fit(logoExpand, 0.1, 1, 0, 1, backInOut), 0, 1, defaultOuter, logoOuter);
    const inner = fit(
      fit(logoExpand, 0, 0.9, 0, 1, backInOut),
      0,
      1,
      defaultOuter * COASTER_INNER_SCALE,
      logoOuter * LOGO_O_INNER_SCALE,
    );
    this.drawQuarter(outer, inner, arcRatio);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cx = width - viewWidth / 2;
    const cy = height / 2 - 2;

    this.drawSketches(ctx, dt, t, cx, cy);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const reach = height / 2;
    if (logoRatio < 1) {
      // Construction lines through the circle's edges, fading out from the centre.
      const layer = document.createElement("canvas");
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
      const l = layer.getContext("2d");
      if (l) {
        l.setTransform(dpr, 0, 0, dpr, 0, 0);
        l.translate(cx, cy);
        l.lineWidth = 1;
        l.setLineDash([3, 3]);
        l.strokeStyle = "#fff";
        l.beginPath();
        for (const r of [-outer, -inner, inner, outer]) {
          l.moveTo(r, -reach);
          l.lineTo(r, reach);
          l.moveTo(-reach, r);
          l.lineTo(reach, r);
        }
        l.stroke();
        l.globalCompositeOperation = "source-in";
        l.globalAlpha = 1 - logoRatio;
        l.drawImage(this.glow, -height / 2, -height / 2, height, height);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
    }
    // One circle becomes two as it slides apart into the wordmark's first and last letters.
    const copies = logoRatio > 0 ? 2 : 1;
    const spread = fit(expoInOut(logoRatio), 0, 1, 0, viewWidth / 2 - outer - width * 0.03125 + 2);
    for (let copy = 0; copy < copies; copy++) {
      ctx.save();
      ctx.globalAlpha = copy === 0 ? 1 : logoRatio;
      ctx.translate(spread * (copy * 2 - 1), 0);
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        ctx.save();
        ctx.rotate((Math.PI / 2) * quadrant);
        ctx.scale(1 / dpr, 1 / dpr);
        ctx.drawImage(this.quarter, -0.25, -0.25);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawSketches(
    ctx: CanvasRenderingContext2D,
    dt: number,
    t: number,
    cx: number,
    cy: number,
  ) {
    if (t <= 0.75 || t >= 2.25) {
      this.sketchShow = 0;
      return;
    }
    this.sketchTime += dt;
    this.sketchShow = Math.min(this.sketchShow + dt * 0.75, 1);
    this.eased.x += (this.pointer.x - this.eased.x) * Math.min(1, dt * 4);
    this.eased.y += (this.pointer.y - this.eased.y) * Math.min(1, dt * 4);
    const unit = this.height / 2;
    // Pointer in the same units as the sketches, measured from the drawing's centre.
    const mouseX = (this.eased.x * this.width) / 2 / unit - (cx - this.width / 2) / unit;
    const mouseY = this.eased.y;
    const leaving = fit(t, 2, 2.25, 0, 1);
    const present = fit(t, 0.75, 1, 0, 1) * (1 - leaving);
    const count = SKETCHES.length;
    const span = 4;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i++) {
      const sketch = this.sketches[i];
      const info = SKETCHES[i];
      if (!sketch || !info) continue;
      const n = i / (count - 1);
      const intro = fit(this.sketchShow, n * 0.15, 0.85 + n * 0.15, 0, 1);
      const order = SKETCH_ORDERS[i] ?? i;
      const cycle = loop(this.sketchTime + i, 0, count);
      const angle =
        (order * Math.PI * 2) / count + this.sketchTime * 0.2 - fit(intro, 0, 1, 5, 0, expoOut);
      const radius = 0.65 * fit(intro, 0, 1, 0.1, 1, backOut) + leaving * 0.7;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const dx = mouseX - x;
      const dy = mouseY - y;
      const near = fit(Math.hypot(dx, dy), 1.3, 0.3, 0, 1);
      const opacity = fit(Math.abs(cycle - span / 2), span / 2, 0, 0.05, 0.3) * present;
      if (opacity <= 0) continue;
      const scale = 0.3333 * fit(intro, 0, 1, 0.1, 1, backOut) + leaving * 0.4;
      const halfHeight = info.scale * scale * unit;
      const halfWidth = info.aspect * halfHeight;
      ctx.save();
      ctx.translate(cx + (x - dx * near * 0.1) * unit, cy - (y - dy * near * 0.1) * unit);
      ctx.rotate(-near * dx * 0.1);
      ctx.globalAlpha = Math.min(1, opacity * 2);
      // Sketches near the front of the cycle are in focus; the rest soften with distance.
      const blur = fit(Math.abs(cycle - span / 2), span / 2, (span / 2) * 0.25, 1, 1 - present);
      const blurPx = ((blur * 15) / 512) * halfWidth * 2;
      ctx.filter = blurPx > 0.3 ? `blur(${blurPx.toFixed(2)}px)` : "none";
      ctx.drawImage(sketch, -halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  dispose() {
    window.removeEventListener("pointermove", this.onPointerMove);
  }
}
