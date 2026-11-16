import { useEffect, useRef, useState } from "react";
import { FlipText } from "@/components/oryzo/FlipText";

import { Chars } from "@/components/oryzo/Chars";
import { OryzoLogo } from "@/components/oryzo/OryzoLogo";
import { productSharedSpecs, productTiers } from "@/lib/oryzo";
import { ProductSketches } from "@/lib/oryzo3d/productSketches";
import { stackState } from "@/lib/oryzo3d/stackState";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type Ease = (t: number) => number;
const fit = (v: number, a: number, b: number, c: number, d: number, ease?: Ease) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return c + (d - c) * (ease ? ease(t) : t);
};
const backOut: Ease = (t) => {
  const s = 1.70158;
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};
const cubicOut: Ease = (t) => 1 - Math.pow(1 - t, 3);
const sineIn: Ease = (t) => 1 - Math.cos((t * Math.PI) / 2);

function DoubleCircles() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle
        cx="10"
        cy="10"
        r="9.5"
        fill="#FFEDD7"
        fillOpacity=".1"
        stroke="#FFEDD6"
        strokeDasharray="2 2"
      />
      <circle cx="9.999" cy="10.002" r="5.499" stroke="#FFEDD6" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * "Choose your own ORYZO": the floating coaster settles under the wordmark, the tier buttons pop
 * in, and picking Pro or Pro Max stacks more coasters beneath it. A comparison table follows.
 */
export function ProductTiers() {
  const ref = useRef<HTMLDivElement>(null);
  const [option, setOption] = useState(0);
  const optionRef = useRef(0);
  optionRef.current = option;

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const q = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector);
    const all = (selector: string) => Array.from(section.querySelectorAll<HTMLElement>(selector));
    const inner = q(".section__inner");
    const hero = q("#product-hero");
    const heroInner = q("#product-hero-inner");
    const titleWrapper = q("#product-hero-title-wrapper");
    const title = q("#product-hero-title");
    const caption = q("#product-hero-caption");
    const options = q("#product-hero-options");
    const details = q("#product-details");
    const detailsInner = q("#product-details-inner");
    const compare = q("#product-compare");
    const buttons = all(".product-hero-option-item");
    const titles = all("#product-details-title-wrapper > span");
    const descs = all("#product-details-desc-wrapper > div");
    const icons = all(".product-details-extra-item svg");
    const extraRows = all(".product-details-extra-item");
    // extras[tier][row]
    const extras = [0, 1, 2].map((tier) =>
      extraRows.map((row) => row.querySelectorAll<HTMLElement>(":scope > div")[tier]),
    );
    const active = [0, 0, 0];
    const sketchCanvas = q<HTMLCanvasElement>(".oz-product-sketches");
    const sketches = sketchCanvas ? new ProductSketches(sketchCanvas, "/oryzo/textures/") : null;
    let frame = 0;
    let last = performance.now();

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!inner || !hero || !heroInner || !titleWrapper || !title || !caption || !options) return;
      if (!details || !detailsInner || !compare) return;
      const vh = window.innerHeight;
      const mobile = window.innerWidth < 768;
      const rect = section.getBoundingClientRect();
      const r = (vh - rect.top) / vh;
      stackState.option = optionRef.current;
      if (r < -2) {
        sketches?.update(dt, 0, 0, 0);
        return;
      }

      const testimonies = document.getElementById("testimonies")?.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const detailsHeight = detailsRect.height / vh;
      const detailsEnd = (detailsRect.bottom - rect.top) / vh;
      const slack = (vh / 2 - detailsRect.height) / vh / 2;
      const settle = detailsEnd + slack;
      const linger = clamp(r - settle, 0, 0.5);

      // The testimonials section has already set the rise and first position; carry on from there.
      let animation = stackState.animation;
      if (testimonies) {
        animation = fit(r, -(rect.top - testimonies.top) / vh + 1, 1, animation, 2);
      }
      animation = fit(r, 1, settle, animation, 3);
      const exit = mobile
        ? rect.height / vh + 1
        : (compare.getBoundingClientRect().top - inner.getBoundingClientRect().top) / vh + 1;
      animation = fit(r, settle, exit, animation, 4);

      let offsetY = stackState.viewOffsetY;
      offsetY = fit(r, -0.5, 0, offsetY, -0.25);
      offsetY = fit(r, 0, 1, offsetY, 0);
      offsetY = fit(
        r,
        1,
        settle,
        offsetY,
        -(r - detailsEnd) + 0.5 - detailsHeight / 2 + (mobile ? -0.19 : 0),
        sineIn,
      );
      offsetY += linger;
      stackState.animation = animation;
      stackState.viewOffsetY = offsetY;
      if (animation >= 4) stackState.active = false;
      sketches?.update(dt, animation, offsetY, linger);

      const shown = r > 0 && animation < 4;
      hero.style.visibility = shown ? "visible" : "hidden";
      details.style.visibility = shown ? "visible" : "hidden";
      if (!shown) return;

      const settling = fit(animation, 2, 3, 0, 1);
      buttons.forEach((button, i) => {
        const n = i / (buttons.length - 1);
        const show = fit(settling, 0.2 + n * 0.3, 0.6 + n * 0.3, 0, 1);
        button.style.opacity = String(show);
        button.style.transform = `scale(${fit(show, 0, 1, 0.5, 1, backOut)})`;
        button.style.pointerEvents = show > 0.75 ? "auto" : "none";
      });

      // The wordmark shrinks a little and rides with the page until the details arrive.
      const scale = fit(r, 1, settle, 1, 0.8);
      const tuck = (titleWrapper.getBoundingClientRect().height / scale) * (1 - scale) * 0.5;
      let y = Math.max(0, r - 1) * vh;
      y -=
        fit(
          r,
          detailsEnd - detailsHeight,
          settle,
          0,
          (detailsHeight + slack) / 2 + (mobile ? 0.06 : 0),
        ) * vh;
      y -= Math.max(0, r - settle) * vh;
      y += linger * vh;
      caption.style.transform = `translate3d(0, ${tuck}px, 0)`;
      options.style.transform = `translate3d(0, ${-tuck}px, 0)`;
      title.style.transform = `scale(${scale})`;
      heroInner.style.transform = `translate3d(0, ${y}px, 0) translate3d(0, -50%, 0)`;
      detailsInner.style.transform = `translate3d(0, ${(linger + (mobile ? 0.06 : 0)) * vh}px, 0)`;

      const reveal = fit(settling, 0.75, 1, 0, 1);
      icons.forEach((icon, i) => {
        const n = i / (icons.length - 1);
        const show = fit(reveal, n * 0.2, n * 0.2 + 0.8, 0, 1);
        icon.style.transform = `scale(${fit(show, 0, 1, 0.01, 1, backOut)}) translateY(-50%)`;
        icon.style.opacity = String(fit(show, 0, 0.5, 0, 1));
      });
      for (let tier = 0; tier < 3; tier++) {
        const k = (active[tier] = clamp(
          (active[tier] ?? 0) + dt * (tier === optionRef.current ? 2 : -1e5),
          0,
          1,
        ));
        const fromLeft = fit(k, 0, 1, -1, 0, cubicOut);
        const fromRight = fit(k, 0, 1, 1, 0, cubicOut);
        const pointer = k === 1 ? "auto" : "none";
        for (const el of [titles[tier], descs[tier]]) {
          if (!el) continue;
          el.style.transform = `translate3d(${fromLeft}em, 0, 0)`;
          el.style.pointerEvents = pointer;
          el.style.setProperty("--show", (k * reveal).toFixed(4));
        }
        const rows = extras[tier] ?? [];
        rows.forEach((el, i) => {
          if (!el) return;
          const n = i / (rows.length - 1);
          el.style.transform = `translate3d(${fromRight}em, 0, 0)`;
          el.style.pointerEvents = pointer;
          el.style.setProperty(
            "--show",
            (k * fit(reveal, n * 0.2, n * 0.2 + 0.8, 0, 1)).toFixed(4),
          );
        });
      }
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      sketches?.dispose();
    };
  }, []);

  return (
    <div id="product" className="section" ref={ref}>
      <canvas className="oz-product-sketches" aria-hidden="true" />
      <div className="section__inner o-container">
        <div id="product-hero">
          <div id="product-hero-inner">
            <h4 id="product-hero-caption">Choose you own</h4>
            <div id="product-hero-title-wrapper">
              <div id="product-hero-title">
                <OryzoLogo />
              </div>
            </div>
            <div id="product-hero-options">
              {productTiers.map((tier, i) => (
                <button
                  type="button"
                  key={tier.name}
                  className={`oz-flip-host product-hero-option-item btn is-large is-dark${option === i ? " is-active" : ""}`}
                  aria-pressed={option === i}
                  onClick={() => setOption(i)}
                >
                  <FlipText text={tier.name} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div id="product-details">
          <div id="product-details-inner">
            <div id="product-details-main">
              <h4 id="product-details-title-wrapper">
                {productTiers.map((tier) => (
                  <span key={tier.name} className="oz-reveal">
                    <Chars lines={[tier.name]} />
                  </span>
                ))}
              </h4>
              <div id="product-details-desc-wrapper" className="body2">
                {productTiers.map((tier) => (
                  <div key={tier.name} className="oz-reveal">
                    <Chars lines={[tier.description]} />
                  </div>
                ))}
              </div>
            </div>
            <div id="product-details-extra" className="body2">
              {[0, 1, 2].map((row) => (
                <div className="product-details-extra-item" key={row}>
                  <DoubleCircles />
                  {productTiers.map((tier) => (
                    <div key={tier.name} className="oz-reveal">
                      <Chars lines={[tier.extras[row] ?? ""]} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <table id="product-compare" className="sub2">
          <tbody>
            <tr>
              {productTiers.map((tier) => (
                <th key={tier.name}>
                  <h5>New</h5>
                  <h4>{tier.name}</h4>
                </th>
              ))}
            </tr>
            <tr className="body3">
              {productTiers.map((tier) => (
                <td key={tier.name}>
                  <span>{tier.tagline}</span>
                </td>
              ))}
            </tr>
            {(
              [
                ["Stack", productTiers.map((tier) => tier.stack)],
                ["Lift", productTiers.map((tier) => tier.lift)],
                ...productSharedSpecs.map(
                  ([label, value]) => [label, [value, value, value]] as const,
                ),
                ["Best for", productTiers.map((tier) => tier.bestFor)],
              ] as const
            ).map(([label, values]) => (
              <tr key={label}>
                {values.map((value, i) => (
                  <td key={i}>
                    <div>{label}:</div>
                    <span>{value}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
