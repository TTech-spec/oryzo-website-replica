import { useEffect, useRef } from "react";

import { socialCards } from "@/lib/oryzo";

const IMAGE_PATH = "/oryzo/images/social-content/";
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fit = (v: number, a: number, b: number, c: number, d: number) =>
  c + (d - c) * clamp((v - a) / (b - a), 0, 1);
const expoInOut = (t: number) =>
  t === 0 || t === 1
    ? t
    : t < 0.5
      ? 0.5 * Math.pow(2, 20 * t - 10)
      : -0.5 * Math.pow(2, 10 - 20 * t) + 1;

type Span = { from: number; to: number };

/**
 * The social wall: a row of posters that wipes open, then travels sideways as the page scrolls,
 * each picture drifting a little inside its frame.
 */
export function SocialWall() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const inner = section.querySelector<HTMLElement>(".section__inner");
    const wrapper = section.querySelector<HTMLElement>("#social-content-items-wrapper");
    if (!inner || !wrapper) return;
    const items = Array.from(section.querySelectorAll<HTMLElement>(".social-content-item"));
    const clippers = Array.from(
      section.querySelectorAll<HTMLElement>(".social-content-item-clipper"),
    );
    const inners = Array.from(section.querySelectorAll<HTMLElement>(".social-content-item-inner"));
    const movers = items.map((item) =>
      Array.from(
        item.querySelectorAll<HTMLElement>(".social-content-item-bg,.social-content-item-cover"),
      ),
    );
    const dots = Array.from(section.querySelectorAll<HTMLElement>(".social-content-progress-item"));

    let spans: Span[] = [];
    let movable = 0;
    let innerWidth = 0;
    let drift = 0;
    let mobile = false;
    let eased = 0;
    let snap = true;
    let clip = 0;
    let frame = 0;
    let last = performance.now();

    const measure = () => {
      mobile = window.innerWidth < 768;
      wrapper.style.transform = "translateZ(0)";
      for (const item of items) item.style.transform = "translateZ(0)";
      for (const list of movers) for (const el of list) el.style.transform = "translateZ(0)";
      innerWidth = mobile ? inner.getBoundingClientRect().width : window.innerWidth;
      const box = wrapper.getBoundingClientRect();
      movable = mobile ? innerWidth * items.length : box.width - innerWidth;
      section.style.height = `${movable + window.innerHeight}px`;
      drift = mobile ? 0 : (200 / 1080) * box.height;
      spans = items.map((item, i) => {
        if (mobile) return { from: innerWidth * i, to: innerWidth * (i + 1) };
        const rect = item.getBoundingClientRect();
        return { from: rect.left - box.left - innerWidth, to: rect.right - box.left };
      });
      snap = true;
    };

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const vh = window.innerHeight;
      const rect = section.getBoundingClientRect();
      const show = (vh - rect.top) / vh;
      if (rect.bottom < -vh || rect.top > vh * 2) return;

      // The posters wipe open once the wall is well into view; scrolling back above resets it.
      if (show < 0) clip = 0;
      else if (show > 0.4) clip = Math.min(1, clip + dt * 1.5);
      const open = mobile ? 1 : expoInOut(clip);
      for (const clipper of clippers) clipper.style.width = `${open * 100}%`;

      const x = clamp((show - 1) * vh, 0, movable);
      wrapper.style.transform = mobile ? "translateZ(0)" : `translate3d(${-x}px, 0, 0)`;
      eased = snap ? x : eased + (x - eased) * (1 - Math.exp(-dt * 10));
      snap = false;

      let current = 0;
      items.forEach((item, i) => {
        const span = spans[i];
        const itemInner = inners[i];
        if (!span || !itemInner) return;
        let shift: number;
        let opacity = 1;
        if (mobile) {
          shift = fit(eased + innerWidth, span.from, span.to, innerWidth, 0);
          opacity =
            i === items.length - 1 ? 1 : fit(eased, span.to - innerWidth * 0.75, span.to, 1, 0);
          if (eased + innerWidth < span.from) opacity = 0;
        } else {
          shift = fit(eased, span.from, span.to, -drift, 0);
        }
        if (eased >= span.from) current = i;
        itemInner.style.opacity = String(opacity);
        item.style.visibility = opacity > 0 ? "visible" : "hidden";
        if (mobile) item.style.transform = `translate3d(${shift}px, 0, 0)`;
        else for (const el of movers[i] ?? []) el.style.transform = `translate3d(${shift}px, 0, 0)`;
      });
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === current));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    for (const img of Array.from(section.querySelectorAll("img"))) {
      if (!img.complete) img.addEventListener("load", measure, { once: true });
    }
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div id="social-content" className="section" ref={ref}>
      <div className="section__inner">
        <div id="social-content-items-wrapper">
          {socialCards.map((card) => (
            <div className="social-content-item" data-id={card.id} key={card.id}>
              <div className="social-content-item-clipper">
                <div className="social-content-item-inner">
                  <picture className="social-content-item-bg">
                    <img
                      src={`${IMAGE_PATH}${card.id}.webp`}
                      alt=""
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                  {"title" in card && (
                    <h5 className="social-content-item-title">
                      {card.title.map((line) => (
                        <span key={line} style={{ display: "block" }}>
                          {line}
                        </span>
                      ))}
                    </h5>
                  )}
                  {"notes" in card && (
                    <div className="social-content-item-note">
                      {card.notes.length > 1
                        ? card.notes.map((note) => <span key={note}>{note}</span>)
                        : card.notes[0]}
                    </div>
                  )}
                  {"cover" in card && (
                    <picture className="social-content-item-cover desktop-only">
                      <img
                        src={`${IMAGE_PATH}${card.id}_cover.webp`}
                        alt=""
                        decoding="async"
                        draggable={false}
                      />
                    </picture>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div id="social-content-progress" className="mobile-only">
          {socialCards.map((card) => (
            <div className="social-content-progress-item" key={card.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
