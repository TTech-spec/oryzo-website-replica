import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  MoveDown,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMemo } from "react";
import heroImage from "@/assets/oryzo-hero.jpg";
import { IntroStage, OryzoLogo } from "@/components/oryzo/IntroStage";
import { Button } from "@/components/ui/button";
import { campaignCards, coasterModels, flipMessage, reviewCards } from "@/lib/oryzo";

const FILM_URL = "https://player.vimeo.com/video/1174820580?h=5aaa6219d2&autoplay=1";

const cardImage = (filename: string) => `/__l5e/assets-v1/${filename}`;

export function OryzoPage() {
  const [selectedModel, setSelectedModel] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [message, setMessage] = useState("");
  const [isEncoded, setIsEncoded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFilm, setShowFilm] = useState(false);

  const shownMessage = useMemo(
    () => (isEncoded ? flipMessage(message) : message),
    [isEncoded, message],
  );
  const model = coasterModels[selectedModel] ?? coasterModels[0]!;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:?subject=ORYZO&body=${encodeURIComponent(window.location.href)}`;
    }
  };

  return (
    <main className="oryzo-page">
      <header className="oz-header">
        <a className="oz-header-logo" href="#intro" aria-label="Oryzo home">
          <OryzoLogo />
        </a>
        <nav className="oz-nav" aria-label="Main navigation">
          <a href="#intro">Intro</a>
          <a href="#features">Features</a>
          <a href="#product">Product</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      <a className="oz-model-tab" href="#model">
        Oryzo-1 Model
      </a>

      <IntroStage onPlayFilm={() => setShowFilm(true)} />

      <section className="features-section">
        <div className="temperature-demo">
          <div className="temperature-copy">
            <span className="feature-eyebrow">A TEMPERATURE-DEPENDENT THEORY OF COASTER</span>
            <h3>
              Choose your
              <br />
              intelligence.
            </h3>
            <p>Set the model temperature. We promise not to pretend there’s a model.</p>
          </div>
          <div className="temperature-control">
            <div className="temperature-output">
              <span>
                {temperature < 2 ? "DETERMINISTIC" : temperature < 6 ? "BALANCED" : "CREATIVE"}
              </span>
              <span>
                T ={" "}
                {temperature === 1
                  ? "0.1"
                  : temperature === 2
                    ? "1"
                    : temperature === 10
                      ? "10"
                      : (temperature / 5).toFixed(1)}
              </span>
            </div>
            <input
              aria-label="Oryzo model temperature"
              min="1"
              max="10"
              step="1"
              type="range"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
            <div className="temperature-scale">
              <span>DETERMINISTIC</span>
              <span>CREATIVE</span>
            </div>
            <p className="temperature-output-note">
              <span className="status-dot" />{" "}
              {temperature > 7
                ? "Thinking about circularity…"
                : temperature > 3
                  ? "Still a coaster."
                  : "Constant lift via geometry."}
            </p>
          </div>
          <div className="temperature-asterisk">
            <VolumeX aria-hidden="true" />
            <span>
              NO TOKENS. NO CLOUD.
              <br />
              NO ACTUAL COMPUTE.
            </span>
          </div>
        </div>
        <div className="encryption-demo">
          <div className="encryption-heading">
            <p className="section-kicker">
              <span className="status-dot" /> Secure communications simplified
            </p>
            <h3>
              Smart flip
              <br />
              <span>encryption.</span>
            </h3>
            <p>Write a message. Flip. Instantly secure — until someone flips it back. Genius.</p>
          </div>
          <div className="encryption-tool">
            <div className="encryption-tool-head">
              <span>ORYZO ENCRYPTION SYSTEM™</span>
              <span className="tool-live">
                <span className="status-dot" /> ON DEVICE
              </span>
            </div>
            <label className="encryption-label" htmlFor="oryzo-message">
              YOUR MESSAGE
            </label>
            <textarea
              id="oryzo-message"
              maxLength={120}
              placeholder="Type something worth protecting…"
              value={shownMessage}
              onChange={(event) => {
                setMessage(isEncoded ? flipMessage(event.target.value) : event.target.value);
              }}
            />
            <div className="encryption-tool-bottom">
              <span>{message.length}/120 · ALGORITHM: REVERSE</span>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsEncoded((current) => !current)}
              >
                {isEncoded ? (
                  <>
                    <RotateCcw aria-hidden="true" /> Decode message
                  </>
                ) : (
                  <>
                    <MoveDown aria-hidden="true" /> Encode message
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="coaster-qa">
        <div className="qa-warning">
          <span>
            FIELD NOTE <b>001</b>
          </span>
          <span>01 / 03</span>
        </div>
        <div className="qa-content">
          <div className="qa-photo-wrap">
            <img
              src={cardImage("/d15eb3b9-afd1-473f-a482-0a430f3a925a/perfect.webp")}
              alt="Close-up of the precision-cut natural cork rim"
              loading="lazy"
            />
            <span>MICRO-TEXTURED CORK · MACRO STUDY</span>
          </div>
          <div className="qa-copy">
            <span className="feature-eyebrow">PRECISION GRIP, ZERO DRAMA</span>
            <h2>
              Grip-locked
              <br />
              <span>antislip</span>
              <br />
              technology.
            </h2>
            <p>
              Micro-textured cork so grippy your drink files a restraining order against gravity.
              Spills? Consider them politely discouraged.
            </p>
            <div className="friction-stat">
              <span>FRICTION COEFFICIENT (EST.)</span>
              <strong>0.80</strong>
            </div>
            <div className="qa-encryption-note">
              <span className="status-dot" /> EXCESSIVE CONFIDENCE. REASONABLE GRIP.
            </div>
          </div>
        </div>
      </section>

      <section className="sustainability">
        <div className="sustainability-hero">
          <div>
            <p className="section-kicker">
              <span className="status-dot" /> Good from the beginning
            </p>
            <span className="sustainability-caption">
              100% PLANT-BASED
              <br />
              VEGAN-FRIENDLY
            </span>
            <h2>
              Nature
              <br />
              knows best<span>.</span>
            </h2>
          </div>
          <div className="sustainability-side">
            <span className="cork-tree" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p>
              Pure cork sourced sustainably. Completely vegan — no cows were harmed, but it might be
              full of “bull”sh*t.
            </p>
            <span>
              RENEWABLE BY NATURE
              <br />
              SIMPLE BY DESIGN
            </span>
          </div>
        </div>
        <div className="sustainability-facts">
          <article>
            <span className="fact-index">01 / GROWTH</span>
            <strong>
              25<span> years</span>
            </strong>
            <h3>Average age of first harvest</h3>
            <p>
              Cork oaks are typically first harvested at around 25 years, once the bark is thick
              enough to remove safely.
            </p>
          </article>
          <article>
            <span className="fact-index">02 / REGENERATION</span>
            <strong>
              09<span> years</span>
            </strong>
            <h3>Harvesting interval</h3>
            <p>
              After each harvest, the bark takes about nine years to regrow, making cork a renewable
              material.
            </p>
          </article>
          <article>
            <span className="fact-index">03 / EFFICIENCY</span>
            <strong>
              0<span> tokens</span>
            </strong>
            <h3>Power draw while in use</h3>
            <p>
              No compute. No tokens. So you can say “please” and “thank you” as much as you want,
              guilt free.
            </p>
          </article>
        </div>
      </section>

      <section className="testimonials">
        <div className="testimonials-heading">
          <div>
            <p className="section-kicker">
              <span className="status-dot" /> Unsolicited. Allegedly.
            </p>
            <h2>
              People all around
              <br />
              the world love <span>Oryzo.</span>
            </h2>
          </div>
          <p>Do not take our word for it. See what people say after living with Oryzo.</p>
        </div>
        <div className="reviews-bar">
          <span>RATING & REVIEWS</span>
          <span>CUSTOM REVIEWS&nbsp; [ 364 ]</span>
          <span>4.9 / 5&nbsp; ★★★★★</span>
          <span>ORYZO IN USE</span>
        </div>
        <div className="review-list">
          {reviewCards.map((review, index) => (
            <article className="review-row" key={review.name}>
              <div className="review-count">0{index + 1}</div>
              <div className="review-rating">
                <span>★ ★ ★ ★ ★</span>
                <b>[ {review.rating} ]</b>
              </div>
              <p className="review-quote">“{review.quote}”</p>
              <div className="review-person">
                <img src={review.image} alt="" width={56} height={56} loading="lazy" />
                <div>
                  <b>{review.name}</b>
                  <span>{review.role}</span>
                </div>
              </div>
              <ArrowUpRight className="review-arrow" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="campaign-wall" aria-labelledby="campaign-wall-heading">
        <div className="campaign-heading">
          <p className="section-kicker">
            <span className="status-dot" /> ORYZO IS TAKING EVERYONE’S JOBS…
          </p>
          <h2 id="campaign-wall-heading">
            …and replacing them
            <br />
            with <span>more coaster.</span>
          </h2>
          <p>AI slop ideas for this winter. Proudly generated by exactly one coaster.</p>
        </div>
        <div className="campaign-grid">
          {campaignCards.map((card, index) => (
            <article className={`campaign-tile campaign-tile-${index + 1}`} key={card.eyebrow}>
              <img src={card.image} alt={card.title} loading="lazy" />
              <div className="campaign-tile-overlay">
                <span>{card.eyebrow}</span>
                <h3>{card.title}</h3>
                <p>{card.note}</p>
                <span className="campaign-tile-index">0{index + 1} / 06</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="product-section" id="product">
        <div className="product-intro">
          <div>
            <p className="section-kicker">
              <span className="status-dot" /> Meet the family
            </p>
            <h2>
              Choose your
              <br />
              <span>own Oryzo.</span>
            </h2>
          </div>
          <p>Three thoughtfully excessive expressions of the same very useful circle.</p>
        </div>
        <div className="product-selector" role="tablist" aria-label="Choose an Oryzo model">
          {coasterModels.map((item, index) => (
            <Button
              key={item.name}
              role="tab"
              aria-selected={selectedModel === index}
              variant={selectedModel === index ? "default" : "outline"}
              onClick={() => setSelectedModel(index)}
            >
              <span>0{index + 1}</span>
              {item.name}
              {index === 1 && <i>NEW</i>}
            </Button>
          ))}
        </div>
        <div className={`product-stage product-stage-${selectedModel + 1}`}>
          <div className="product-stage-copy">
            <span className="product-stage-tag">{model.tag}</span>
            <h3>{model.name}</h3>
            <p>{model.description}</p>
            <span className="product-stage-count">
              STACK: 0{model.stack} <i>·</i> LIFT: {model.lift.toUpperCase()}
            </span>
          </div>
          <div
            className="product-stack-illustration"
            aria-label={`${model.name}: ${model.stack} cork coaster${model.stack > 1 ? "s" : ""} stacked`}
          >
            <img
              className="product-stack-base"
              src={heroImage}
              alt="Natural cork coaster"
              width={1104}
              height={1408}
              loading="lazy"
            />
            {model.stack > 1 && (
              <img
                className="product-stack-layer product-stack-layer-one"
                src={heroImage}
                alt=""
                width={1104}
                height={1408}
                loading="lazy"
              />
            )}
            {model.stack > 2 && (
              <img
                className="product-stack-layer product-stack-layer-two"
                src={heroImage}
                alt=""
                width={1104}
                height={1408}
                loading="lazy"
              />
            )}
            <span className="product-orbit" aria-hidden="true" />
            <span className="product-orbit-label">
              CORK
              <br />
              01 — 03
            </span>
          </div>
          <div className="product-side-note">
            <span>
              THE THING
              <br />
              ABOUT ORYZO
            </span>
            <ArrowDown aria-hidden="true" />
            <span>
              STAYS PUT.
              <br />
              LOOKS GOOD.
            </span>
          </div>
        </div>
        <div className="product-summary">
          <div className="product-summary-highlight">
            <span>NOW CONSIDERED A STANDARD</span>
            <h3>{model.blurb}</h3>
            <p>{model.detail}</p>
          </div>
          <dl className="product-specs">
            <div>
              <dt>STACK</dt>
              <dd>0{model.stack}</dd>
            </div>
            <div>
              <dt>LIFT</dt>
              <dd>{model.lift.toUpperCase()}</dd>
            </div>
            <div>
              <dt>MATERIAL</dt>
              <dd>CORK</dd>
            </div>
            <div>
              <dt>CONNECTIVITY</dt>
              <dd>NONE</dd>
            </div>
            <div>
              <dt>PAIRING</dt>
              <dd>NOT REQUIRED</dd>
            </div>
            <div>
              <dt>UPDATES</dt>
              <dd>NEVER</dd>
            </div>
            <div>
              <dt>BEST FOR</dt>
              <dd>{model.bestFor.toUpperCase()}</dd>
            </div>
          </dl>
        </div>
        <div className="product-disclaimer">
          <span>
            <Volume2 aria-hidden="true" /> MADE WITH WOOD, NOT WEIGHTS.
          </span>
          <span>NO PRODUCT IS ACTUALLY FOR SALE.</span>
        </div>
      </section>

      <section className="paper-section" id="model">
        <div className="paper-heading">
          <p className="section-kicker">
            <span className="status-dot" /> Our SOTA open weight model
          </p>
          <h2>
            Oryzo-1.
            <br />
            <span>Open-source-ish.</span>
          </h2>
          <p>A technically unnecessary study of a technically necessary coaster.</p>
        </div>
        <div className="paper-content">
          <div className="paper-meta">
            <span>ORYZO RESEARCH DIVISION</span>
            <span>ARXIV-STYLE NONSENSE · 2026</span>
            <span>OPEN WEIGHT · 01 COASTER</span>
          </div>
          <h3>
            Oryzo-1: an open-weight 3D model of a cork coaster for rendering, simulation, and
            gloriously unnecessary research.
          </h3>
          <div className="paper-rule" />
          <div className="paper-columns">
            <div>
              <span className="paper-label">ABSTRACT</span>
              <p>
                We present Oryzo-1, an open-weight 3D model of a cork coaster for rendering,
                simulation, and gloriously unnecessary research. Oryzo-1 faithfully reproduces key
                coaster behaviors — table protection, perfect circularity, and passive thermal
                moderation under everyday beverage conditions. Released in clean OBJ format with
                baseline results on our own WoodenBench (a standardized evaluation suite conducted
                on a single desk and very possibly rigged by us). Limitations include heavy
                dependency on gravity, mugs, and human deployment.
              </p>
            </div>
            <div>
              <span className="paper-label">ACKNOWLEDGEMENTS</span>
              <p>
                This website was single-shot espresso’d into existence by the creative team at
                Lusion.
              </p>
              <span className="paper-label paper-reviewer">PEER REVIEW</span>
              <p>
                “Oryzo-1 A0B is the best model out there. Trust me bro.”
                <br />
                <span>— Anonymous LocalLLaMA Reddit user</span>
              </p>
            </div>
          </div>
          <div className="paper-rule" />
          <div className="paper-citation">
            <span>BIBTEX</span>
            <code>{`@misc{oryzo2026,\n  title   = {Oryzo-1: Open-Weight Coaster Model},\n  author  = {Lusion},\n  year    = {2026},\n  format  = {OBJ release},\n  note    = {Code: coming soon.}\n}`}</code>
          </div>
          <div className="paper-links">
            <a href="#product">
              PAPER <ArrowUpRight aria-hidden="true" />
            </a>
            <a href="#product">
              MODEL (.OBJ) <ArrowUpRight aria-hidden="true" />
            </a>
            <span>CODE COMING SOON</span>
          </div>
        </div>
      </section>

      <footer className="oryzo-footer" id="contact">
        <div className="footer-warning">
          <span>WE CAUGHT YOUR ATTENTION WITH A NON-EXISTENT PRODUCT.</span>
          <span>IF WE CAN SELL A COASTER,</span>
          <span>IMAGINE WHAT WE CAN DO FOR YOUR BRAND.</span>
        </div>
        <a className="lusion-link" href="https://lusion.co/" target="_blank" rel="noreferrer">
          LUSION.CO <ArrowUpRight aria-hidden="true" />
        </a>
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#intro" className="oryzo-wordmark">
              ORYZO<span>®</span>
            </a>
            <span>
              BUILT BY LUSION
              <br />
              WITH LOVE<span className="footer-heart"> ♥</span>
            </span>
          </div>
          <div className="footer-share">
            <span>
              SHARE WITH FRIENDS
              <br />
              IF YOU LIKE IT
            </span>
            <Button variant="outline" size="sm" onClick={handleCopyUrl}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "COPIED" : "COPY URL"}
            </Button>
          </div>
          <div className="footer-contact">
            <span>NEW BUSINESS</span>
            <a href="mailto:business@lusion.co">
              BUSINESS@LUSION.CO <ArrowUpRight aria-hidden="true" />
            </a>
            <span>GENERAL ENQUIRIES</span>
            <a href="mailto:hello@lusion.co">
              HELLO@LUSION.CO <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <div className="footer-social">
            <a href="https://x.com/" target="_blank" rel="noreferrer">
              X <ArrowUpRight aria-hidden="true" />
            </a>
            <a href="https://instagram.com/" target="_blank" rel="noreferrer">
              INSTAGRAM <ArrowUpRight aria-hidden="true" />
            </a>
            <a href="https://linkedin.com/" target="_blank" rel="noreferrer">
              LINKEDIN <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="footer-foot">
          <span>© ORYZO™ 2026</span>
          <span>TERMS & CONDITIONS</span>
          <span>PRIVACY POLICY</span>
          <p>
            THIS ENTIRE SITE IS A FICTIONAL CREATIVE PROJECT BY LUSION. ORYZO DOESN’T EXIST. NO
            PRODUCTS ARE FOR SALE. ALL CLAIMS ARE SATIRICAL AND FOR ENTERTAINMENT PURPOSES ONLY.
          </p>
          <span>01—∞</span>
        </div>
      </footer>

      {showFilm && (
        <div
          className="oz-film"
          role="dialog"
          aria-modal="true"
          aria-label="Oryzo film"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowFilm(false);
          }}
        >
          <button type="button" className="oz-film-close" onClick={() => setShowFilm(false)}>
            Close
          </button>
          <div className="oz-film-frame">
            <iframe
              src={FILM_URL}
              title="Oryzo film"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </main>
  );
}
