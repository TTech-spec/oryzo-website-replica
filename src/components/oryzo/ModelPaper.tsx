import { OryzoLogo } from "@/components/oryzo/OryzoLogo";
import {
  CODE_ICON,
  MODEL_ICON,
  ONE_MARK,
  PAPER_ICON,
  type Icon,
} from "@/components/oryzo/tailIcons";

const REPO = "https://github.com/lusionltd/ORYZO-1";

const BIBTEX = `@misc{oryzo2026,
  title        = {Oryzo-1: Open-Weight Coaster Model},
  author       = {Lusion},
  year         = {2026},
  howpublished = {OBJ release},
  note         = {A high-fidelity 3D model of a cork
coaster. Code: coming soon.
}`;

function PaperLink({ href, icon, label }: { href: string; icon: Icon; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn is-dark">
      <svg viewBox={icon.viewBox} aria-hidden="true">
        <path d={icon.d} />
      </svg>
      <span>{label}</span>
    </a>
  );
}

/** The ORYZO-1 "open weight model" write-up, laid out like a research paper's landing page. */
export function ModelPaper() {
  return (
    <div id="open-weight" className="section">
      <div className="section__inner body2">
        <div id="open-weight-header">
          <h5 id="open-weight-tagline" className="sub2">
            Our SOTA Open Weight model
          </h5>
          <h2 id="open-weight-title" aria-label="Oryzo-1">
            <OryzoLogo />
            <svg viewBox={ONE_MARK.viewBox} aria-hidden="true">
              <path fill="currentColor" d={ONE_MARK.d} />
            </svg>
          </h2>
          <div id="open-weight-btns-wrapper">
            <PaperLink href={`${REPO}/tree/main/paper.pdf`} icon={PAPER_ICON} label="Paper" />
            <PaperLink
              href={`${REPO}/tree/main/checkpoints`}
              icon={MODEL_ICON}
              label="MODEL (.OBJ)"
            />
            <PaperLink href={REPO} icon={CODE_ICON} label="Code coming soon" />
          </div>
        </div>
        <div className="open-weight-article">
          <h5 className="open-weight-cat">Abstract</h5>
          <div className="open-weight-desc">
            We present <span>Oryzo-1</span>, an open-weight 3D model of a cork coaster for
            rendering, simulation, and gloriously unnecessary research. Oryzo-1 faithfully
            reproduces key coaster behaviors - table protection, perfect circularity, and passive
            thermal moderation under everyday beverage conditions. Released in clean OBJ format with
            baseline results on our own WoodenBench (a standardized evaluation suite conducted on a
            single desk and very possibly rigged by us). Limitations include heavy dependency on
            gravity, mugs, and human deployment.
          </div>
        </div>
        <div className="open-weight-article">
          <h5 className="open-weight-cat">Acknowledgements</h5>
          <div className="open-weight-desc">
            This website was single-shot espresso’d into existence by the creative team at Lusion.
          </div>
        </div>
        <div className="open-weight-article">
          <h5 className="open-weight-cat">Peer Review</h5>
          <div className="open-weight-desc">
            "Oryzo-1 A0B is the best model out there. <span>Trust me bro</span>."
            <br />
            <span className="open-weight-article-small">- Anonymous LocalLLaMA Reddit user</span>
          </div>
        </div>
        <div className="open-weight-article">
          <h5 className="open-weight-cat">BibTeX</h5>
          <pre id="open-weight-bibtex">{BIBTEX}</pre>
        </div>
      </div>
    </div>
  );
}
