import { FEATURE_EQUATIONS, FEATURE_ICONS } from "@/components/oryzo/featureArt";
import { OryzoLogo } from "@/components/oryzo/OryzoLogo";

export const FEATURES = [
  {
    id: "elevate",
    tagline: "Rise above mediocrity",
    desc: "With a precision-engineered lift (exactly one coaster thick), Oryzo doesn’t just hold your mug - it elevates it. Literally. Above every boring surface you’ve ever known.",
    title: "Elevate your coffee experience",
    footnote: ["Constant lift via geometry"],
  },
  {
    id: "temperature",
    tagline: "Handles Extremes with Ease",
    desc: "From piping-hot mugs to ice-cold drinks - Oryzo stays perfectly stable. Your coffee table already tapped out three sips ago.",
    title: "Thermodynamic stability",
    footnote: ["THERMAL DIFFUSION MODEL (TDM)", "A visualization, not a warranty"],
  },
  {
    id: "curve",
    tagline: "Perfectly Round, Seriously",
    desc: "Our engineers recalibrated its circumference with disturbing levels of attention to detail - just because we could.",
    title: "Now 37.9% More Circular",
    footnote: [
      "Circularity (circle = 1.0)",
      "RoPE: Roundness Optimization & Perimeter Engineering",
    ],
  },
] as const;

/**
 * Copy for the three desk-scene features. Each item reads --in / --out (0..1) from its own
 * element, set by the stage's scroll timeline.
 */
export function FeaturesLayer() {
  return (
    <div className="oz-feat">
      <div className="oz-feat-panel" aria-hidden="true" />
      <div className="oz-feat-items">
        {FEATURES.map((feature, index) => (
          <article className="oz-feat-item" key={feature.id} data-id={feature.id}>
            <div>
              <div className="oz-feat-top">
                <span
                  className="oz-feat-icon"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: FEATURE_ICONS[index] ?? "" }}
                />
                <p className="oz-feat-tagline">{feature.tagline}</p>
              </div>
              <p className="oz-feat-desc">{feature.desc}</p>
            </div>
            <div>
              <span className="oz-dashline" />
              <h3 className="oz-feat-title">{feature.title}</h3>
            </div>
          </article>
        ))}
      </div>
      <div className="oz-feat-logo" aria-hidden="true">
        <OryzoLogo />
      </div>
      <canvas className="oz-feat-curve" aria-hidden="true" />
      <div className="oz-feat-slider" aria-hidden="true">
        <div className="oz-feat-slider-text">
          <span>
            Creative
            <br />T = 10
          </span>
          <span>
            Balanced
            <br />T = 1
          </span>
          <span>
            Deterministic
            <br />T = 0.1
          </span>
        </div>
        <div className="oz-feat-slider-bar" />
      </div>
      <div className="oz-feat-extras">
        {FEATURES.map((feature, index) => (
          <div className="oz-feat-extra" key={feature.id}>
            <p>
              {feature.footnote.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
            <span
              className="oz-feat-equation"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: FEATURE_EQUATIONS[index] ?? "" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
