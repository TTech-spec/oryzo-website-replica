# ORYZO Website Replica

A practice rebuild of [oryzo.ai](https://oryzo.ai/), the satirical "world's most unnecessarily sophisticated cork coaster" campaign site by [Lusion](https://lusion.co/).

This is a personal learning project for studying scroll-driven WebGL storytelling. It is not affiliated with Lusion and is not meant to be published as an original work. The concept, copy, 3D models, textures and film belong to Lusion.

## What's built so far

- **Scroll-driven 3D intro**: the desk hero, the "Isn't just a coaster" flip and the "Powered by AI" hand, rendered with Three.js. The camera, coaster and hand follow the original site's baked animation tracks, so the motion matches frame for frame as you scroll.
- **Lighting**: the coaster uses a port of the original shader, with environment-map lighting that cross-fades between the desk and the dark set, cork bump mapping and a ray-marched soft self-shadow.
- **Interaction**: desk props fly in on load and scatter when the pointer brushes them; the hand's fingers curl when you hover them during the highlight.
- **Wearable gallery**: "So portable, it's wearable" — the coaster spins while a red foil wrapper closes around it, the wrapper tears open (a baked simulation played from a texture), and the coaster flies back to land on the jacket photo. The headline is drawn in the 3D layer from a distance-field texture and breaks up into grain behind the photo as it arrives. Then a framed gallery steps sideways through eight scenes (two videos, the bikini prompt, the stunt warning) and ends on the RISE magazine cover, which opens up to fill the screen.
- **Hero UI**: wordmark, intro copy, studio card, and a film button that opens the Vimeo player.
- **Desk scene**: the magazine cover is a live 3D window onto the desk set. Desk, wall and pegboard are baked-texture meshes with ray-marched contact shadows; the props (keyboard, controller, pegboard clutter) are Gaussian splats; the coffee cup drops onto the coaster. The frame then opens to full screen and the baked features camera move plays with the Elevate, Thermodynamic stability and More Circular copy.
- **Remaining sections** (thermal and roundness effects, flip encryption, grip, sustainability, testimonials, social wall, product tiers, model paper, contact): content is in place with basic styling. Their 3D scenes and final layouts are still to come.

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
| `src/components/oryzo/WearableLayer.tsx` | Wearable gallery and magazine cover markup |
| `src/lib/oryzo3d/stage.ts` | Three.js scene: desk layer, coaster, hand, lighting, scroll timeline |
| `src/lib/oryzo3d/shaders.ts` | GLSL for the coaster, hand and desk props |
| `src/lib/oryzo3d/deskProps.ts` | Desk props with pointer-driven spring physics |
| `src/components/oryzo/FeaturesLayer.tsx` | Features copy shown over the desk scene |
| `src/lib/oryzo3d/table.ts` | Desk set: surfaces, coffee cup, baked features animation |
| `src/lib/oryzo3d/splats.ts` | Gaussian splat loader and renderer for `.sog` files |
| `src/lib/oryzo3d/anim.ts` | Baked transform tracks and geometry helpers |
| `src/lib/oryzo3d/wrapper.ts` | Foil wrapper tear driven by a baked animation texture |
| `src/lib/oryzo3d/handRig.ts` | Finger joints rebuilt from the baked skinning data |
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
4. `5.5 – 8`: the "Powered by AI" highlight glow.
5. `8 – 21.25`: the wearable gallery, on its own clock that starts at 8. From 18 the desk set renders inside the magazine frame.
6. `21.25 – 27.75`: the frame opens to full screen and the features camera move plays.

## Deploying to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new) and deploy. No settings are needed: the build detects Vercel and outputs for it automatically.
