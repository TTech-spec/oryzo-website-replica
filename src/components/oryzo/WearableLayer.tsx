import { useState } from "react";

const GALLERY = "/oryzo/images/wearable-gallery/";

export const WEARABLE_ITEMS = [
  { id: "intro", type: "image", file: "intro.webp" },
  { id: "yoga", type: "video", file: "yoga.mp4" },
  { id: "shoulder", type: "image", file: "shoulder.webp" },
  { id: "bikini", type: "image", file: "bikini.webp" },
  { id: "glasses", type: "image", file: "glasses.webp" },
  { id: "bite", type: "video", file: "bite.mp4" },
  { id: "pocket", type: "image", file: "pocket.webp" },
  { id: "outro", type: "image", file: "outro.webp" },
] as const;

const thumbFile = (id: string) => `${GALLERY}thumbs/${id === "bikini" ? "bikini_on" : id}.webp`;

function Thumbs({ side }: { side: "left" | "right" }) {
  return (
    <div className={`oz-wear-thumbs is-${side}`} aria-hidden="true">
      <div className="oz-wear-thumbs-move">
        {WEARABLE_ITEMS.map((item) => (
          <div className="oz-wear-thumb" key={item.id}>
            <img src={thumbFile(item.id)} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The giant headline. It sits behind the 3D canvas so the coaster passes in front of it. */
export function WearableHeadline() {
  return (
    <div className="oz-wear-big" aria-label="it's wearable">
      it’s wearable
    </div>
  );
}

/**
 * "So portable, it's wearable": a framed gallery that steps sideways as you scroll, ending on
 * the magazine cover. All motion comes from CSS variables set by the stage's scroll timeline.
 */
export function WearableLayer() {
  const [bikiniAdded, setBikiniAdded] = useState(false);

  return (
    <div className="oz-wear">
      <h4 className="oz-wear-title">
        <span className="oz-wear-title-1">
          {"So portable,".split("").map((char, index, all) => (
            <i
              key={index}
              style={{ "--n": (index / (all.length - 1)).toFixed(3) } as React.CSSProperties}
            >
              {char === " " ? " " : char}
            </i>
          ))}
        </span>
      </h4>

      <Thumbs side="left" />
      <Thumbs side="right" />

      <div className="oz-wear-main">
        <div className="oz-wear-frame" aria-hidden="true">
          <span className="oz-wear-frame-circle" />
          <span className="oz-wear-frame-dot" />
        </div>
        <div className="oz-wear-gallery">
          <div className="oz-wear-gallery-move">
            {WEARABLE_ITEMS.map((item, index) => (
              <div
                className={`oz-wear-item${item.id === "bikini" && bikiniAdded ? " is-added" : ""}`}
                data-id={item.id}
                data-index={index}
                key={item.id}
              >
                <div className="oz-wear-item-inner">
                  {item.type === "video" ? (
                    <video src={GALLERY + item.file} muted loop playsInline preload="metadata" />
                  ) : (
                    <img
                      src={GALLERY + item.file}
                      alt=""
                      loading={index === 0 ? "eager" : "lazy"}
                    />
                  )}

                  {item.id === "bikini" && (
                    <>
                      <div className="oz-wear-bikini-overlay">
                        <img src={`${GALLERY}bikini_on.webp`} alt="" loading="lazy" />
                      </div>
                      <div className="oz-wear-bikini-message">
                        <div>
                          Hey <span>@oryzo</span>, can you put on a bikini?
                        </div>
                        <button type="button" onClick={() => setBikiniAdded(true)}>
                          Send
                        </button>
                      </div>
                    </>
                  )}

                  {item.id === "outro" && (
                    <div className="oz-mag">
                      <div className="oz-mag-issue">ISSUE NO. 00124</div>
                      <div className="oz-mag-idea">
                        <div className="oz-mag-idea-num">25</div>
                        <div className="oz-mag-idea-txt">
                          AI SLOP IDEAS
                          <br />
                          FOR THIS
                          <br />
                          WINTER
                        </div>
                      </div>
                      <div className="oz-mag-main">
                        <div className="oz-mag-main-1">We Are So</div>
                        <div className="oz-mag-main-2">Cooked!</div>
                        <div className="oz-mag-main-desc">
                          <span>Oryzo is taking everyone&apos;s jobs...</span>
                          <span>and replacing them with AI!</span>
                        </div>
                      </div>
                      <div className="oz-mag-num">
                        <small>№</small>6
                      </div>
                      <div className="oz-mag-corner">
                        <div className="oz-mag-corner-title">ORYZO-1</div>
                        <div className="oz-mag-corner-desc">
                          <span>An open-weight model designed to be</span>
                          <span>lightweight and easy to carry.</span>
                        </div>
                        <div className="oz-mag-barcode" />
                      </div>
                    </div>
                  )}
                </div>

                {item.id === "yoga" && (
                  <div className="oz-wear-warning">
                    <div className="oz-wear-warning-badge">
                      <span aria-hidden="true">⚠</span>
                      <h5>Warning</h5>
                    </div>
                    <div className="oz-wear-warning-message">
                      This stunt was performed by professionals.
                      <br />
                      Do not attempt this at home.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="oz-wear-scroll">
        <span className="oz-scroll-hint-icon" aria-hidden="true" />
        Scroll to continue
      </div>
    </div>
  );
}
