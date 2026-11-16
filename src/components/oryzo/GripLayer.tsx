/**
 * "Grip-locked antislip technology": copy over a cork close-up, with a draggable microscope
 * window. Motion comes from GripView, which reads the stage's scroll timeline.
 */
export function GripLayer() {
  return (
    <div className="oz-grip">
      <div className="oz-grip-backdrop" aria-hidden="true">
        <img
          className="oz-grip-soft"
          src="/oryzo/textures/table/cork_closeup.webp"
          alt=""
          loading="lazy"
        />
        <img
          className="oz-grip-sharp"
          src="/oryzo/textures/table/cork_closeup.webp"
          alt=""
          loading="lazy"
        />
      </div>
      <canvas className="oz-grip-bears" aria-hidden="true" />
      <canvas className="oz-grip-bear3d" aria-hidden="true" />
      <div className="oz-grip-header">
        <p className="oz-grip-tagline">Precision Grip, Zero Drama</p>
        <h2 className="oz-grip-title">
          Grip-locked Antislip
          <br />
          technology
        </h2>
        <p className="oz-grip-desc">
          Micro-textured cork so grippy your drink files
          <br />
          a restraining order against gravity. Spills?
          <br />
          Consider them politely discouraged.
        </p>
      </div>
      <div className="oz-grip-box">
        <div className="oz-grip-box-inner">
          <canvas className="oz-grip-canvas" />
          <div className="oz-grip-content">
            <span className="oz-grip-content-bg" />
            <span className="oz-grip-label">Friction coefficient (est):</span>
            <span className="oz-grip-coeff">0.80</span>
          </div>
        </div>
      </div>
      <div className="oz-grip-hint" aria-hidden="true">
        <svg viewBox="0 0 100 15">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="0.25"
            d="M50,12.125c32,0,50,-8.5,50,-10"
            strokeDasharray="1 1"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="0.25"
            d="M50,12.125c-32,0,-50,-8.5,-50,-10"
            strokeDasharray="1 1"
          />
          <circle cx="50" cy="12.125" r="0.8" fill="currentColor" />
          <circle className="oz-grip-hint-dot" cx="50" cy="12.125" r="1.8" fill="currentColor" />
        </svg>
        <span>Drag</span>
      </div>
    </div>
  );
}
