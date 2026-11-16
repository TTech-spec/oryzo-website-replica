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
- **Desk effects**: a heat-camera pass for Thermodynamic stability (diagonal wipe, glowing cup, temperature scale), swaying window light, a mirror image of the props in the desk varnish, and steam from the cup.
- **Bloom**: the stage renders through an off-screen buffer whose bright parts are blurred at five scales and added back, with a different look per scene (haze on the desk, tight glow on the headline, the hot cup on the heat camera).
- **Roundness study**: for More Circular, a blueprint canvas draws the coaster as bezier arcs with control handles while design sketches drift around it; the circle then grows and splits into the O's of the ORYZO wordmark.
- **Flip encryption**: type a message and it is burnt into the coaster's underside; the coaster tumbles over on a baked flip track to hide or reveal it, with an Encode/Decode button.
- **Grip close-up**: the camera drops to the cork's edge, a monochrome close-up photograph takes over, and a draggable microscope window shows the texture with a live friction reading.
- **Sustainability**: a top-down slab of cork-oak bark splits along its seam and rolls back like a peel, revealing the title (drawn from the original's vector outline) glowing on dark ground. The ground then turns cream under swaying leaf shadow, and three fact cards follow with their Rive animations, their text fading in letter by letter. Moving the mouse over the title sends dashes running around the nearby letters.
- **Testimonials**: "People all around the world love Oryzo" with a table of five reviews. Each row lights up letter by letter as it reaches the middle of the screen and dims as it leaves, while the coaster floats and tumbles behind the reviews on a warm glow.
- **Social wall**: nine posters wipe open, then travel sideways as you scroll, each picture drifting inside its frame.
- **Product tiers**: "Choose you own ORYZO". The floating coaster stops tumbling and lies down under the wordmark while the camera lifts; the three tier buttons pop in, and choosing Pro or Pro Max stacks a second and third coaster beneath it. A comparison table follows.
- **ORYZO-1 paper** and **footer**: the open-weight model write-up with its BibTeX block, then the closing reveal, contact and social links. "Copy URL" works; the newsletter form only validates, because this practice build has no mailing list behind it.
- **Loading screen**: the coaster drawn as a design sketch on green, with turning dashed circles, orange Bezier handles and a ring that fills as the 3D scene loads, then opens onto the hero.
- **Footer coffee beans**: a stream of 3D coffee beans spirals diagonally behind the footer. The pointer is a small light that pushes beans aside; beans away from it fade into the dark.
- **Product extras**: orange design sketches fan out around the product coaster and lean towards the pointer, and the settled coaster blends into the original's product photograph.
- **Big water bear**: drag the microscope back and forth about ten times; the small water bears wake and a 3D water bear climbs out of the window, turning towards the pointer.
- **Hover flip**: button and link text rolls up letter by letter on hover.
- **Phone layout**: every section has a phone layout (checked at 390px wide).
- **Typeface**: the original uses Halyard Display, which is licensed through Adobe Fonts. To use it, create a kit with Halyard Display at fonts.adobe.com, allow your domain, and set `VITE_ADOBE_FONTS_KIT` to the kit id (in Vercel: Project Settings, Environment Variables). Without it, Hanken Grotesk stands in.
- **Not built**: the original's bone-rigged leg wiggle on the big water bear (it moves as one piece here), the footer beans' soft shadows, and a real newsletter signup (the form only checks the address).

## Tech stack

- [TanStack Start](https://tanstack.com/start) + React 19 + TypeScript
- [Three.js](https://threejs.org/) for the WebGL stage
- [Rive](https://rive.app/) for the sustainability card animations
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
| `src/components/oryzo/EncryptionLayer.tsx` | Flip encryption copy, message field and flip button |
| `src/components/oryzo/GripLayer.tsx` | Grip copy, cork backdrop and microscope window markup |
| `src/lib/oryzo3d/gripView.ts` | Grip backdrop, drag and microscope drawing |
| `src/components/oryzo/SustainabilityLayer.tsx` | Sustainability copy and the fact cards |
| `src/components/oryzo/SocialWall.tsx` | Horizontally scrolling posters |
| `src/components/oryzo/ProductTiers.tsx` | Tier chooser, comparison table and the coaster's settle and stack control |
| `src/components/oryzo/ModelPaper.tsx`, `SiteFooter.tsx` | ORYZO-1 write-up and footer |
| `src/lib/oryzo3d/coffeeBeans.ts`, `productSketches.ts`, `waterBear3D.ts` | Footer beans, product sketches and the big water bear |
| `src/components/oryzo/FlipText.tsx` | Letter flip on hover |
| `src/oryzo-tail.css` | Grid, type scale and layout for the sections below the testimonials |
| `src/components/oryzo/Testimonials.tsx` | Review table and the scroll control for the floating coaster |
| `src/components/oryzo/Chars.tsx` | Splits text into letters for letter-by-letter reveals |
| `src/lib/oryzo3d/stackState.ts` | Shared state for the coaster that floats behind the page sections |
| `src/lib/oryzo3d/sustainability.ts` | Bark peel, title outline and shadowed ground |
| `src/lib/oryzo3d/messageText.ts` | Distance-field text for the coaster's stamped message |
| `src/components/oryzo/FeaturesLayer.tsx` | Features copy shown over the desk scene |
| `src/lib/oryzo3d/table.ts` | Desk set: surfaces, coffee cup, baked features animation |
| `src/lib/oryzo3d/bloom.ts` | Bloom post-process (high-pass, blur pyramid, composite) |
| `src/lib/oryzo3d/curveStudy.ts` | 2D blueprint canvas for the roundness study |
| `src/lib/oryzo3d/splats.ts` | Gaussian splat loader and renderer for `.sog` files |
| `src/lib/oryzo3d/anim.ts` | Baked transform tracks and geometry helpers |
| `src/lib/oryzo3d/wrapper.ts` | Foil wrapper tear driven by a baked animation texture |
| `src/lib/oryzo3d/handRig.ts` | Finger joints rebuilt from the baked skinning data |
| `src/lib/oryzo3d/buf.ts` | Decoder for the `.buf` geometry and animation files |
| `src/lib/oryzo.ts` | Tier, testimonial and social wall data |
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
6. `21.25 – 30.75`: the frame opens to full screen, the features camera move plays, then the roundness study.
7. `30.75 – 39.75`: flip encryption, then the grip close-up.
8. `39.75 – 44.75`: sustainability; the pinned stage ends here and the page scrolls normally. The canvas stays fixed to the screen so the coaster can reappear behind the testimonials.

## Deploying to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new) and deploy. No settings are needed: the build detects Vercel and outputs for it automatically.
