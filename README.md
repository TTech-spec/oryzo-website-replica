# ORYZO Website Replica

A practice rebuild of [oryzo.ai](https://oryzo.ai/), the satirical "world's most unnecessarily sophisticated cork coaster" campaign site by [Lusion](https://lusion.co/).

This is a personal learning project for studying scroll-driven WebGL storytelling. It is not affiliated with Lusion and is not meant to be published as an original work. The concept, copy, 3D models, textures and film belong to Lusion.

## What's built so far

- **Scroll-driven 3D intro**: the desk hero, the "Isn't just a coaster" flip and the "Powered by AI" hand, rendered with Three.js. The camera, coaster and hand follow the original site's baked animation tracks, so the motion matches frame for frame as you scroll.
- **Hero UI**: wordmark, intro copy, studio card, and a film button that opens the Vimeo player.
- **Remaining sections** (features, testimonials, social wall, product tiers, model paper, contact): content is in place with basic styling. Their 3D scenes and final layouts are still to come.

## Tech stack

- [TanStack Start](https://tanstack.com/start) + React 19 + TypeScript
- [Three.js](https://threejs.org/) for the WebGL stage
- Tailwind CSS v4 plus plain CSS for the campaign layout
- Vite

## Project structure

| Path | Purpose |
| --- | --- |
| `src/components/OryzoPage.tsx` | The single-page campaign, section by section |
| `src/components/oryzo/IntroStage.tsx` | Pinned intro: canvas plus scroll-animated copy |
| `src/lib/oryzo3d/stage.ts` | Three.js scene: desk layer, coaster, hand, lighting, scroll timeline |
| `src/lib/oryzo3d/buf.ts` | Decoder for the `.buf` geometry and animation files |
| `src/lib/oryzo.ts` | Tier, testimonial and campaign data |
| `src/oryzo.css` | Page styles |
| `public/oryzo/` | Models, textures and images used by the stage |

## Development

```sh
npm install
npm run dev
```

Other scripts:

```sh
npm run build    # production build
npm run lint     # eslint
npm run test     # vitest
```

## How the intro animation works

Scroll position is measured in viewport heights. The first ten screens are pinned while a single value drives everything:

1. `0 – 0.5`: the desk fades out and the scene goes dark.
2. `0 – 5.5`: the camera and coaster play through 116 baked frames (lift, flip, settle).
3. From frame 71 the hand rises under the coaster, skinned on the GPU from 36 baked bones.
4. `5.5 – 8`: the "Powered by AI" highlight glow, then everything fades for the next section.
