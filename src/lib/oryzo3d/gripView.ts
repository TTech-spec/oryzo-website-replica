// "Grip-locked antislip": the desk gives way to a monochrome close-up of the cork's edge, with a
// draggable microscope window showing the texture gripping the surface.

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
const cubicOut = (t: number) => 1 - (1 - t) ** 3;
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export class GripView {
  private backdrop: HTMLElement | null;
  private box: HTMLElement | null;
  private inner: HTMLElement | null;
  private canvas: HTMLCanvasElement | null;
  private coeff: HTMLElement | null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** The microscope strip stores three focal planes, one per colour channel. */
  private planes: HTMLCanvasElement[] = [];
  private dragging = false;
  private lastPointerX = 0;
  private targetX = 0;
  private x = 0;
  private delayedX = 0;
  private mouse = { x: 0, y: 0, inside: false };
  private mouseEased = { x: 0, y: 0 };
  private mouseZoom = 1;
  private coeffSeed = -1;
  private draggedTime = 0;
  private hasDragged = false;
  private draggable = false;

  constructor(
    private root: HTMLElement,
    microscopeUrl: string,
  ) {
    this.backdrop = root.querySelector(".oz-grip-backdrop");
    this.box = root.querySelector(".oz-grip-box");
    this.inner = root.querySelector(".oz-grip-box-inner");
    this.canvas = root.querySelector(".oz-grip-canvas");
    this.coeff = root.querySelector(".oz-grip-coeff");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.loadPlanes(microscopeUrl);
    this.inner?.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
  }

  private loadPlanes(url: string) {
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
          const v = pixels[p + channel] ?? 0;
          data.data[p] = data.data[p + 1] = data.data[p + 2] = v;
          data.data[p + 3] = 255;
        }
        octx.putImageData(data, 0, 0);
        this.planes[channel] = out;
      }
    };
    image.src = url;
  }

  private onDown = (event: PointerEvent) => {
    if (!this.draggable) return;
    event.preventDefault();
    this.dragging = true;
    this.lastPointerX = event.clientX;
  };

  private onMove = (event: PointerEvent) => {
    const rect = this.canvas?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      const mx = (event.clientX - rect.left) / rect.width - 0.5;
      const my = (event.clientY - rect.top) / rect.height - 0.5;
      this.mouse.inside = Math.abs(mx) <= 0.5 && Math.abs(my) <= 0.5;
      this.mouse.x = this.mouse.inside ? mx : 0;
      this.mouse.y = this.mouse.inside ? my : 0;
    }
    if (this.dragging) {
      this.targetX += ((event.clientX - this.lastPointerX) / this.dragRange()) * 2;
      this.lastPointerX = event.clientX;
      if (this.mouse.inside) this.hasDragged = true;
    }
  };

  private onUp = () => {
    this.dragging = false;
  };

  private dragRange() {
    const boxWidth = this.box?.getBoundingClientRect().width ?? 300;
    return Math.max(40, Math.min(window.innerWidth - boxWidth - window.innerWidth * 0.0625, 200));
  }

  /**
   * @param section viewport heights into the grip section
   * @param tableClock the desk set's clock (the close-up fades over it from 8.5 to 9)
   */
  update(dt: number, section: number, tableClock: number) {
    const show = fit(section, 0.5, 1, 0, 1);
    const hide = fit(section, 2.5, 3, 0, 1);
    const copyVisible = show * (1 - hide) > 0;
    this.root.dataset["grip"] = copyVisible ? "on" : "off";
    this.root.style.setProperty("--grip-in", show.toFixed(4));
    this.root.style.setProperty("--grip-out", hide.toFixed(4));

    // Backdrop: the cork close-up fades over the desk, zooms in a touch, then dims behind the copy.
    const backdropShow = fit(tableClock, 8.5, 9, 0, 1);
    const backdropHide = fit(tableClock, 9, 10, 0, 1);
    if (this.backdrop) {
      const visible = backdropShow > 0 && backdropHide < 1;
      this.backdrop.style.visibility = visible ? "visible" : "hidden";
      if (visible) {
        let brightness = fit(backdropShow, 0.65, 1, 1, 0.1);
        brightness = fit(backdropHide, 0.75, 1, brightness, 0);
        this.backdrop.style.opacity = fit(backdropShow, 0, 0.5, 0, 1).toFixed(3);
        this.backdrop.style.setProperty("--zoom", fit(backdropShow, 0, 1, 1, 1.25).toFixed(4));
        this.backdrop.style.setProperty(
          "--blur",
          `${(fit(backdropShow, 0.5, 0.9, 0, 1) * 0.9).toFixed(3)}vh`,
        );
        this.backdrop.style.setProperty("--brightness", brightness.toFixed(3));
      }
    }

    this.draggable = show > 0.6 && hide < 0.4;
    if (this.inner) this.inner.style.pointerEvents = this.draggable ? "auto" : "none";
    if (!this.dragging) this.targetX = 0;
    if (!copyVisible) {
      this.x = this.targetX = 0;
      this.hasDragged = false;
      this.draggedTime = 0;
      return;
    }
    if (this.hasDragged) this.draggedTime += dt;
    this.root.style.setProperty("--grip-hint", fit(this.draggedTime, 0, 1, 1, 0).toFixed(3));

    // The window follows the drag and springs back when released, lifting slightly at the ends.
    const follow = this.dragging ? 1 : 1 - Math.exp(-10 * dt);
    this.x += (Math.min(1, Math.max(-1, this.targetX)) - this.x) * follow;
    this.delayedX += (this.x - this.delayedX) * (1 - Math.exp(-40 * dt));
    const range = this.dragRange();
    const shiftX = (this.x * range) / 2;
    const shiftY = ((Math.abs(this.x) ** 4 * range) / window.innerHeight) * -40;
    if (this.inner)
      this.inner.style.transform = `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0)`;

    const seed = hash(Math.floor(this.x * 1000 + 0.5));
    if (seed !== this.coeffSeed && this.coeff) {
      this.coeffSeed = seed;
      this.coeff.textContent = fit(seed, 0, 1, 0.8, 0.93).toFixed(2);
    }

    const ease = 1 - Math.exp(-10 * dt);
    this.mouseEased.x += (this.mouse.x - this.mouseEased.x) * ease;
    this.mouseEased.y += (this.mouse.y - this.mouseEased.y) * ease;
    this.mouseZoom += ((this.mouse.inside ? 1.4 : 1) - this.mouseZoom) * ease;
    this.drawMicroscope(fit(show, 0.3, 1, 0, 1), hide);
  }

  private drawMicroscope(show: number, hide: number) {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.opacity = (show * (1 - hide)).toFixed(3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const [near, mid, far] = this.planes;
    if (!near || !mid || !far) return;

    // The window shows a 2:1 slice of the strip: a quarter of its width, sliding 1.25 widths per
    // unit of drag, shifted by the pointer and magnified about a point just below centre.
    const zoom = fit(show, 0, 1, 0.5, 1, cubicOut) * this.mouseZoom;
    const mx = this.mouseEased.x;
    const my = -this.mouseEased.y;
    const centreU = (this.x * 1.25 + mx * 0.5) / zoom + 0.5;
    const spanU = 0.5 / zoom;
    const centreV = (my * 0.5 + 0.08) / zoom - 0.08 + 0.5;
    const spanV = 1 / zoom;
    const tw = near.width;
    const th = near.height;
    const draw = (plane: HTMLCanvasElement, alpha: number) => {
      if (alpha <= 0.002) return;
      ctx.globalAlpha = alpha;
      const sx = (centreU - spanU / 2) * tw;
      const sw = spanU * tw;
      // Canvas v runs down, texture v runs up.
      const sy = (1 - (centreV + spanV / 2)) * th;
      const sh = spanV * th;
      // The strip repeats sideways: tile enough copies to cover the window.
      const scale = w / sw;
      const first = Math.floor(sx / tw);
      for (let tile = first; tile * tw < sx + sw; tile++) {
        ctx.drawImage(
          plane,
          0,
          0,
          tw,
          th,
          (tile * tw - sx) * scale,
          (-sy / sh) * h,
          tw * scale,
          (th / sh) * h,
        );
      }
    };
    // Moving the pointer across the window racks focus through the three planes.
    const toMid = fit(mx, -0.5, 0, 0, 1);
    const toFar = fit(mx, 0, 0.5, 0, 1);
    draw(near, 1);
    draw(mid, toMid);
    draw(far, toFar);
    ctx.globalAlpha = 1 - fit(show, 0.5, 1, 0.3, 1, cubicOut);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  dispose() {
    this.inner?.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
  }
}
