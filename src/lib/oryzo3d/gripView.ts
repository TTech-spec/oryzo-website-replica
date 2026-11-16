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

// Easter egg: drag the microscope long enough and tardigrades ("water bears") drift out across
// the screen, bouncing off the edges and away from the pointer.
const BEAR_WIDTHS = [338, 220, 364, 440, 426, 416];
const BEAR_SCALES = [1.3, 1.5, 1.3, 1, 1, 1];
const BEAR_HEIGHT = 256;
const BEAR_TOTAL = BEAR_WIDTHS.reduce((sum, w) => sum + w, 0);
const BEAR_COUNT = BEAR_WIDTHS.length * 2;
const BEAR_SPEED_MIN = 0.1;
const BEAR_SPEED_MAX = 0.3;
const BEAR_DEFAULT_SCALE = 0.12;
const POINTER_RADIUS = 0.05;

interface Bear {
  sprite: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotation: number;
  spin: number;
  speed: number;
  cruise: number;
  /** Seconds since it last bumped into something (drives the squash-and-stretch). */
  bump: number;
}

const elasticOut = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;

export class GripView {
  private bearCanvas: HTMLCanvasElement | null;
  private bearCtx: CanvasRenderingContext2D | null = null;
  private bearSheet: HTMLCanvasElement | null = null;
  private bears: Bear[] = [];
  private bearsActive = false;
  private bearRatio = 0;
  private bearStart = 0;
  private dragTravel = 0;
  private previousX = 0;
  private pointerNdc = { x: 9, y: 9, vx: 0, vy: 0 };
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
    this.bearCanvas = root.querySelector(".oz-grip-bears");
    this.bearCtx = this.bearCanvas?.getContext("2d") ?? null;
    this.loadBears(microscopeUrl.replace("microscopic.webp", "WATERBEAR_2.webp"));
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

  /** The sheet stores brightness in red and a cut-out mask in green. */
  private loadBears(url: string) {
    const image = new Image();
    image.onload = () => {
      const sheet = document.createElement("canvas");
      sheet.width = image.width;
      sheet.height = image.height;
      const sctx = sheet.getContext("2d", { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(image, 0, 0);
      const data = sctx.getImageData(0, 0, image.width, image.height);
      for (let p = 0; p < data.data.length; p += 4) {
        const v = data.data[p] ?? 0;
        const mask = data.data[p + 1] ?? 0;
        data.data[p] = data.data[p + 1] = data.data[p + 2] = v;
        data.data[p + 3] = mask;
      }
      sctx.putImageData(data, 0, 0);
      this.bearSheet = sheet;
    };
    image.src = url;
  }

  private resetBears() {
    this.bearStart = 0;
    this.bears = [];
    for (let i = 0; i < BEAR_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = BEAR_SPEED_MIN + Math.random() * (BEAR_SPEED_MAX - BEAR_SPEED_MIN);
      this.bears.push({
        sprite: i % BEAR_WIDTHS.length,
        x: 0,
        y: -0.25,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        rotation: angle,
        spin: -1.5 + Math.random() * 3,
        speed,
        cruise: speed,
        bump: 1,
      });
    }
  }

  /** Positions are in screen units: -1..1 on both axes, y up. */
  private updateBears(dt: number, opacity: number) {
    const canvas = this.bearCanvas;
    const ctx = this.bearCtx;
    const sheet = this.bearSheet;
    if (!canvas || !ctx) return;
    const visible = opacity > 0 && !!sheet;
    canvas.style.visibility = visible ? "visible" : "hidden";
    if (!visible || !sheet) {
      this.bears = [];
      return;
    }
    if (!this.bears.length) this.resetBears();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = opacity;

    this.bearStart = clamp01(this.bearStart + 0.25 * dt);
    const scale = fit(this.bearStart, 0, 0.5, 0, BEAR_DEFAULT_SCALE, elasticOut);
    const aspect = width / height;
    const decay = 1 - Math.exp(-dt * 2);
    const pointer = this.pointerNdc;
    const sheetScale = sheet.width / BEAR_TOTAL;
    let sheetX = 0;
    const starts = BEAR_WIDTHS.map((w) => {
      const start = sheetX;
      sheetX += w;
      return start;
    });

    for (const bear of this.bears) {
      bear.speed = Math.max(BEAR_SPEED_MIN, bear.speed + (bear.cruise - bear.speed) * decay);
      // They burst out fast, then settle to a drift.
      const step = (bear.speed + (1 - this.bearStart)) * dt;
      bear.x += bear.dx * step;
      bear.y += bear.dy * step;

      const size = (BEAR_SCALES[bear.sprite] ?? 1) * scale;
      const halfH = 0.5 * size;
      const halfW = (0.5 * size * (BEAR_WIDTHS[bear.sprite] ?? BEAR_HEIGHT)) / BEAR_HEIGHT / aspect;
      if (bear.x < -1 + halfW) {
        bear.x = -1 + halfW;
        bear.dx = -bear.dx;
        bear.bump = 0;
      } else if (bear.x > 1 - halfW) {
        bear.x = 1 - halfW;
        bear.dx = -bear.dx;
        bear.bump = 0;
      }
      if (bear.y < -1 + halfH) {
        bear.y = -1 + halfH;
        bear.dy = -bear.dy;
        bear.bump = 0;
      } else if (bear.y > 1 - halfH) {
        bear.y = 1 - halfH;
        bear.dy = -bear.dy;
        bear.bump = 0;
      }

      // The pointer knocks them away, passing on some of its own speed.
      const ox = bear.x - pointer.x;
      const oy = bear.y - pointer.y;
      const distance = Math.hypot(ox, oy);
      if (distance < POINTER_RADIUS + Math.max(halfW, halfH) && distance > 1e-5) {
        const ix = bear.dx * bear.speed + pointer.vx * 0.1;
        const iy = bear.dy * bear.speed + pointer.vy * 0.1;
        const impulse = Math.hypot(ix, iy);
        if (impulse > 1e-6) {
          bear.dx = ix / impulse;
          bear.dy = iy / impulse;
          bear.speed = Math.max(BEAR_SPEED_MIN, impulse);
        }
        bear.bump = 0;
      }
      bear.rotation += bear.spin * dt;
      bear.bump = clamp01(bear.bump + dt);

      const wobble = (Math.cos(0.5 * Math.PI * bear.bump) * Math.sin(8 * Math.PI * bear.bump)) ** 2;
      const drawH = size * (height / 2);
      const drawW = (drawH * (BEAR_WIDTHS[bear.sprite] ?? BEAR_HEIGHT)) / BEAR_HEIGHT;
      ctx.save();
      ctx.translate((bear.x * 0.5 + 0.5) * width, (0.5 - bear.y * 0.5) * height);
      ctx.rotate(-bear.rotation);
      ctx.scale(1 + 0.12 * wobble, 1 - 0.12 * wobble);
      ctx.drawImage(
        sheet,
        (starts[bear.sprite] ?? 0) * sheetScale,
        0,
        (BEAR_WIDTHS[bear.sprite] ?? BEAR_HEIGHT) * sheetScale,
        sheet.height,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    pointer.vx = 0;
    pointer.vy = 0;
  }

  private onDown = (event: PointerEvent) => {
    if (!this.draggable) return;
    event.preventDefault();
    this.dragging = true;
    this.lastPointerX = event.clientX;
  };

  private onMove = (event: PointerEvent) => {
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = -((event.clientY / window.innerHeight) * 2 - 1);
    if (this.pointerNdc.x < 5) {
      this.pointerNdc.vx += (nx - this.pointerNdc.x) * 60;
      this.pointerNdc.vy += (ny - this.pointerNdc.y) * 60;
    }
    this.pointerNdc.x = nx;
    this.pointerNdc.y = ny;
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
      this.bearsActive = false;
      this.bearRatio = 0;
      this.dragTravel = 0;
      this.previousX = 0;
      this.updateBears(dt, 0);
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

    // Ten window-widths of dragging wakes the water bears.
    this.dragTravel += Math.abs(this.x - this.previousX);
    this.previousX = this.x;
    if (this.dragTravel > 10) this.bearsActive = true;
    this.bearRatio = this.bearsActive ? Math.min(1, this.bearRatio + dt) : 0;
    this.updateBears(dt, this.bearRatio * fit(show, 0.3, 1, 0, 1) * (1 - hide));
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
    const spanU = 0.5 / zoom;
    const centreV = (my * 0.5 + 0.08) / zoom - 0.08 + 0.5;
    const spanV = 1 / zoom;
    const tw = near.width;
    const th = near.height;
    const draw = (plane: HTMLCanvasElement, alpha: number, offsetX: number) => {
      if (alpha <= 0.002) return;
      ctx.globalAlpha = alpha;
      const centreU = (offsetX * 1.25 + mx * 0.5) / zoom + 0.5;
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
    // Fast drags smear: average several exposures between where the window was and where it is.
    const travel = Math.abs(this.x - this.delayedX);
    const exposures = travel > 0.002 ? 6 : 1;
    for (let i = 0; i < exposures; i++) {
      const at = this.delayedX + (this.x - this.delayedX) * ((i + 1) / exposures);
      const weight = 1 / (i + 1);
      draw(near, weight, at);
      draw(mid, toMid * weight, at);
      draw(far, toFar * weight, at);
    }
    // The window dims as it fades in, and again once the water bears take the stage.
    ctx.globalAlpha = 1 - fit(show, 0.5, 1, 0.3, 1, cubicOut) * (1 - 0.85 * this.bearRatio);
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
