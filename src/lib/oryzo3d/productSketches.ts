import { loadSketches, SKETCHES } from "@/lib/oryzo3d/curveStudy";

// Which sketch sits at each slot of the fan around the product coaster, and how it is turned and sized.
const ORDERS = [3, 1, 2, 5, 4];
const TRANSFORMS = [
  { rot: -0.1, scale: 0.36 },
  { rot: -0.2, scale: 0.28 },
  { rot: 0.2, scale: 0.4 },
  { rot: -0.3, scale: 0.3 },
  { rot: 0.3, scale: 0.3 },
];

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
const cubicOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Orange design sketches fanned out above the product coaster. They grow in one after another,
 * bob gently, and lean towards the pointer, sharpening as it comes near.
 */
export class ProductSketches {
  private ctx: CanvasRenderingContext2D | null;
  private sketches: (HTMLCanvasElement | null)[] = [null, null, null, null, null, null];
  private time = 0;
  private show = 0;
  private pointer = { x: 0, y: 0 };
  private eased = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private drawn = false;

  constructor(
    private canvas: HTMLCanvasElement,
    texturePath: string,
  ) {
    this.ctx = canvas.getContext("2d");
    loadSketches(texturePath, (index, sketch) => {
      this.sketches[index] = sketch;
    });
    window.addEventListener("pointermove", this.onPointerMove);
  }

  private onPointerMove = (event: PointerEvent) => {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
  };

  dispose() {
    window.removeEventListener("pointermove", this.onPointerMove);
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.ceil(width * dpr);
    this.canvas.height = Math.ceil(height * dpr);
  }

  /**
   * @param animation the floating coaster's clock (2-3 settling under the title, 3-4 holding)
   * @param offsetY the coaster's vertical view offset, in screen heights
   * @param leave 0-1 as the details scroll away
   */
  update(dt: number, animation: number, offsetY: number, leave: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!(animation > 2.5 && animation < 4)) {
      this.show = 0;
      this.time = 0;
      if (this.drawn) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawn = false;
      }
      return;
    }
    this.resize();
    this.time += dt;
    this.show = Math.min(this.show + dt * 0.75, 1);
    const ease = Math.min(1, dt * 4);
    this.eased.x += (this.pointer.x - this.eased.x) * ease;
    this.eased.y += (this.pointer.y - this.eased.y) * ease;

    const mobile = this.width < 768;
    const present = fit(animation, 2.5, 3, 0, 1) * (1 - fit(leave, 0.25, 0.5, 0, 1));
    const unit = this.height / 2;
    const cx = this.width / 2;
    const cy = this.height / 2 + offsetY * this.height;
    const mouseX = (this.width / this.height) * this.eased.x;
    const mouseY = this.eased.y - offsetY * 2;
    const reach = mobile ? 0.5 : 0.9;
    const size = mobile ? 0.5 : 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawn = true;
    ctx.globalCompositeOperation = "lighter";
    for (let slot = 0; slot < ORDERS.length; slot++) {
      const index = ORDERS[slot] ?? 0;
      const sketch = this.sketches[index];
      const info = SKETCHES[index];
      const transform = TRANSFORMS[slot];
      if (!sketch || !info || !transform) continue;
      const n = slot / (ORDERS.length - 1);
      const intro = fit(this.show, n * 0.15, 0.85 + n * 0.15, 0, 1);
      const angle = Math.PI * 0.5 - (n - 0.5) * 3.1;
      const radius = fit(intro, 0, 1, 0.1, reach, backOut);
      const x = Math.cos(angle) * radius;
      const y = Math.pow(Math.max(0, Math.sin(angle)), 0.25) * radius * 0.75;
      const dx = mouseX - x;
      const dy = mobile ? 0 : mouseY - y;
      const near = fit(Math.hypot(dx, dy), 1.3, 0.3, 0, 1);
      const rotation =
        transform.rot + near * dx * 0.1 + Math.sin(this.time * 0.3 + n * Math.PI * 2) * 0.1;
      const scale =
        fit(this.show, 0, 1, 0.01, transform.scale * fit(near, 0, 1, 1, 1.05), backOut) *
        (1 + Math.sin(this.time * 0.4 + n * Math.PI * 2) * 0.1) *
        size;
      const opacity =
        fit(this.show, 0, 1, fit(this.show, 0, 0.3, 0, 1), fit(near, 0, 1, 0, 0.6)) * present;
      if (opacity <= 0.001) continue;
      const blur = fit(near, 0, 1, 0.5 * this.show, 0, cubicOut);
      const halfHeight = info.scale * scale * unit;
      const halfWidth = info.aspect * halfHeight;
      ctx.save();
      ctx.translate(cx + (x - dx * near * 0.1) * unit, cy - (y - dy * near * 0.1) * unit);
      ctx.rotate(-rotation);
      ctx.globalAlpha = Math.min(1, opacity * 1.5);
      const blurPx = ((blur * 15) / 512) * halfWidth * 2;
      ctx.filter = blurPx > 0.3 ? `blur(${blurPx.toFixed(2)}px)` : "none";
      ctx.drawImage(sketch, -halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
