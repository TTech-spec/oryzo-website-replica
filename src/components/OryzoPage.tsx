import { useState } from "react";
import { IntroStage } from "@/components/oryzo/IntroStage";
import { ModelPaper } from "@/components/oryzo/ModelPaper";
import { OryzoLogo } from "@/components/oryzo/OryzoLogo";
import { ProductTiers } from "@/components/oryzo/ProductTiers";
import { SiteFooter } from "@/components/oryzo/SiteFooter";
import { SocialWall } from "@/components/oryzo/SocialWall";
import { SustainabilityStats } from "@/components/oryzo/SustainabilityLayer";
import { Testimonials } from "@/components/oryzo/Testimonials";

const FILM_URL = "https://player.vimeo.com/video/1174820580?h=5aaa6219d2&autoplay=1";

export function OryzoPage() {
  const [showFilm, setShowFilm] = useState(false);

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
      <a className="oz-model-tab" href="#open-weight">
        Oryzo-1 Model
      </a>

      <IntroStage onPlayFilm={() => setShowFilm(true)} />

      <SustainabilityStats />

      <Testimonials />

      <div className="oz-tail">
        <SocialWall />
        <ProductTiers />
        <ModelPaper />
        <SiteFooter />
      </div>

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
