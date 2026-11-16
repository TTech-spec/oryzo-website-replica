import { useEffect, useRef, useState, type FormEvent } from "react";
import { FlipText } from "@/components/oryzo/FlipText";

import { ARROW_ICON, HEART_ICON } from "@/components/oryzo/tailIcons";
import { CoffeeBeans } from "@/lib/oryzo3d/coffeeBeans";

/** Closing section: the reveal that the product is fictional, plus contact and social links. */
export function SiteFooter() {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const beansRef = useRef<HTMLCanvasElement>(null);

  // The coffee-bean stream runs only while the footer is on screen.
  useEffect(() => {
    const canvas = beansRef.current;
    if (!canvas) return;
    let beans: CoffeeBeans | null = null;
    try {
      beans = new CoffeeBeans(canvas, "/oryzo/");
    } catch {
      return;
    }
    const scene = beans;
    let visible = false;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      if (visible) scene.update(dt);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    observer.observe(canvas);
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      scene.setPointer(event.clientX - rect.left, event.clientY - rect.top);
    };
    window.addEventListener("pointermove", onMove);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      scene.dispose();
    };
  }, []);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 100);
    } catch {
      setCopied(false);
    }
  };

  // This practice build has no mailing list behind it, so the form only validates.
  const subscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("EMAIL") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ text: "Please enter a valid email address.", error: true });
      return;
    }
    setMessage({ text: "Demo only - nothing was sent.", error: false });
  };

  return (
    <div id="footer" className="section">
      <canvas ref={beansRef} className="oz-footer-beans" aria-hidden="true" />
      <div className="section__inner o-container o-grid">
        <div id="footer-top">
          <div id="footer-lusion-logo" />
          <h2 id="footer-title">
            <span>We caught your attention with a non-existent product.</span>
            <span>If we can sell a coaster, imagine what we can do for your brand.</span>
          </h2>
        </div>
        <a
          id="footer-lusion-link"
          className="btn is-dark"
          href="https://lusion.co/"
          target="_blank"
          rel="noreferrer"
        >
          <FlipText text="lusion.co" />
        </a>
        <div id="footer-love" className="sub2">
          <div>
            Built by{" "}
            <a href="https://lusion.co/" target="_blank" rel="noreferrer">
              Lusion
            </a>
            <br />
            with love{" "}
            <svg viewBox={HEART_ICON.viewBox} aria-hidden="true">
              <path fill="currentColor" d={HEART_ICON.d} />
            </svg>
          </div>
          <div>
            <span>Share with friends</span>
            <span> If you like it</span>
          </div>
          <button
            type="button"
            className={copied ? "copied oz-flip-host" : "oz-flip-host"}
            onClick={copyUrl}
          >
            <FlipText text="Copy URL" />
          </button>
        </div>
        <div id="footer-email" role="region" aria-labelledby="footer-newsletter-label">
          <label
            id="footer-newsletter-label"
            className="footer-item-caption sub2"
            htmlFor="footer-email-input"
          >
            Subscribe to Lusion's Newsletter:
          </label>
          <form id="footer-newsletter-form" noValidate onSubmit={subscribe}>
            <div id="footer-email-input-wrapper">
              <input
                type="email"
                id="footer-email-input"
                name="EMAIL"
                autoComplete="email"
                placeholder="Your Email"
                required
                aria-describedby="footer-newsletter-message"
              />
              <button type="submit" id="footer-email-btn" aria-label="Subscribe to newsletter">
                <svg viewBox={ARROW_ICON.viewBox} fill="none" aria-hidden="true">
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d={ARROW_ICON.d}
                  />
                </svg>
              </button>
              <div className="o-dashline" />
            </div>
            <div
              id="footer-newsletter-message"
              aria-live="polite"
              className={message ? (message.error ? "is-error" : "is-success") : undefined}
            >
              {message?.text}
            </div>
          </form>
        </div>
        <div id="footer-contact-wrapper">
          <div id="contact" className="footer-item">
            <div className="footer-item-caption sub2">New Business:</div>
            <a className="footer-item-link oz-flip-host" href="mailto:business@lusion.co">
              <FlipText text="business@lusion.co" />
            </a>
          </div>
          <div className="footer-item">
            <div className="footer-item-caption sub2">General Enquires:</div>
            <a className="footer-item-link oz-flip-host" href="mailto:hello@lusion.co">
              <FlipText text="hello@lusion.co" />
            </a>
          </div>
        </div>
        <div id="footer-social-wrapper">
          <a
            className="footer-item-link oz-flip-host"
            href="https://x.com/lusionltd"
            target="_blank"
            rel="noreferrer"
          >
            X
          </a>
          <a
            className="footer-item-link oz-flip-host"
            href="https://www.instagram.com/lusionltd"
            target="_blank"
            rel="noreferrer"
          >
            <FlipText text="Instagram" />
          </a>
          <a
            className="footer-item-link oz-flip-host"
            href="https://www.linkedin.com/company/lusionltd"
            target="_blank"
            rel="noreferrer"
          >
            <FlipText text="Linkedin" />
          </a>
        </div>
        <div id="footer-caption" className="sub2">
          <div className="o-dashline mobile-only" />
          <span>
            This entire site is a fictional creative project by Lusion. Oryzo doesn't exist. No
            products are for sale. All claims are satirical and for entertainment purposes only.
          </span>
        </div>
      </div>
    </div>
  );
}
