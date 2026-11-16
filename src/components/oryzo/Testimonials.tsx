import { useEffect, useRef } from "react";

import { Chars } from "@/components/oryzo/Chars";
import { reviewCards } from "@/lib/oryzo";
import { stackState } from "@/lib/oryzo3d/stackState";

const STAR =
  "M6.9604.9533c.1811-.464.8376-.464,1.0187,0l1.5153,3.8817c.0777.1991.2643.3347.4776.347l4.1599.2415c.4972.0289.7001.6533.3148.9689l-3.2234,2.6405c-.1654.1355-.2366.3548-.1825.5616l1.0558,4.0309c.1262.4818-.405.8677-.8242.5988l-3.5074-2.2497c-.1799-.1154-.4105-.1154-.5904,0l-3.5074,2.2497c-.4192.2689-.9504-.117-.8242-.5988l1.0558-4.0309c.0542-.2068-.0171-.4261-.1825-.5616L.4928,6.3925c-.3853-.3156-.1824-.94.3148-.9689l4.1599-.2415c.2134-.0124.4-.1479.4777-.347l1.5152-3.8817Z";

function Stars({ value }: { value: number }) {
  return (
    <svg
      width="96"
      height="15"
      viewBox="0 0 96 15"
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${i * 19} 0)`}>
          <path d={STAR} fill="currentColor" opacity={value >= i + 1 ? 1 : 0.25} />
          {value > i && value < i + 1 && (
            // Half star: the same shape clipped to its left half.
            <path d={STAR} fill="currentColor" clipPath="inset(0 50% 0 0)" />
          )}
        </g>
      ))}
    </svg>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fit = (v: number, a: number, b: number, c: number, d: number) =>
  c + (d - c) * clamp01((v - a) / (b - a));

/**
 * "People all around the world love Oryzo": a table of reviews that light up one by one as they
 * pass the middle of the screen, with the coaster floating behind them.
 */
export function Testimonials() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const items = Array.from(section.querySelectorAll<HTMLElement>(".oz-tm-item"));
    const lines = Array.from(
      section.querySelectorAll<HTMLElement>(
        ".oz-tm-table > .oz-dashline, .oz-tm-list > .oz-dashline",
      ),
    );
    let frame = 0;

    const update = () => {
      frame = requestAnimationFrame(update);
      const vh = window.innerHeight;
      const top = section.getBoundingClientRect().top;
      const offset = (vh - top) / vh;
      section.style.setProperty("--title", fit(offset, 0.25, 0.75, 0, 1).toFixed(4));
      section.style.setProperty("--desc", fit(offset, 0.5, 1, 0, 1).toFixed(4));

      items.forEach((item, i) => {
        const rect = item.getBoundingClientRect();
        // Measured from the row's centre: it brightens entering the middle of the screen and
        // dims again as it leaves towards the top.
        const at = (vh - rect.top) / vh - rect.height / vh / 2;
        const lit = fit(at, 0.15, 0.45, 0, 1);
        const leaving = fit(at, 0.55, 0.85, 1, 0.2);
        item.style.setProperty("--lit", lit.toFixed(4));
        item.style.opacity = leaving.toFixed(4);
        const before = lines[i];
        const after = lines[i + 1];
        if (before && at > 0.5) before.style.opacity = leaving.toFixed(4);
        if (after) after.style.opacity = (0.2 + 0.8 * lit).toFixed(4);
      });

      // Floating coaster: rises with this section. The product section takes it over from there.
      const animation = fit(offset, 0, 1, 0, 1);
      const viewOffsetY = fit(offset, 0, 1, 1, 0);
      stackState.active = offset > 0;
      stackState.animation = animation;
      stackState.viewOffsetY = viewOffsetY;
      stackState.clip = Math.min(1, offset);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      stackState.active = false;
    };
  }, []);

  return (
    <section className="oz-tm" id="testimonies" ref={ref}>
      <div className="oz-tm-hero">
        <h2 className="oz-tm-title">
          <Chars lines={["People all around the world love Oryzo"]} />
        </h2>
        <p className="oz-tm-desc">
          <Chars
            lines={["Do not take our word for it, see what people say after living with Oryzo."]}
          />
        </p>
      </div>
      <div className="oz-tm-table">
        <div className="oz-tm-header">
          <span>Rating &amp; Reviews</span>
          <span className="oz-tm-header-center">
            <span>Custom reviews [ 364 ]</span>
            <span className="oz-tm-rating">
              <Stars value={5} />[ 4.9/5 ]
            </span>
          </span>
          <span>ORYZO in use</span>
        </div>
        <span className="oz-dashline" />
        <div className="oz-tm-list">
          {reviewCards.map((review) => (
            <div key={review.name} style={{ display: "contents" }}>
              <article className="oz-tm-item">
                <div className="oz-tm-content">
                  <div className="oz-tm-rating">
                    <Stars value={review.stars} />[ {review.rating} ]
                  </div>
                  <p className="oz-tm-quote">
                    <Chars lines={review.quote} highlight={review.highlight} />
                  </p>
                  <div className="oz-tm-author">
                    <div>{review.name}</div>
                    <div>{review.role}</div>
                  </div>
                </div>
                <div className="oz-tm-image">
                  <img
                    src={review.image}
                    alt=""
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </article>
              <span className="oz-dashline" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
