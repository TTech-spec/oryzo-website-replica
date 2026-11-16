export const coasterModels = [
  {
    name: "ORYZO",
    stack: 1,
    lift: "1 coaster thick",
    blurb: "One coaster. One job. Done beautifully.",
    description:
      "The original. Refined until it feels inevitable. Lifts just enough, grips just right, and quietly disappears into your day like it was never there.",
    bestFor: "Daily mugs and quiet desks",
    detail: "Single layer lift · Natural cork insulation · Stable everyday grip",
    tag: "THE ORIGINAL",
  },
  {
    name: "ORYZO Pro",
    stack: 2,
    lift: "2 coasters thick",
    blurb: "Twice the cork. Twice the commitment. Still effortless.",
    description:
      "A little more presence. Double the cork, double the confidence — without losing the plot.",
    bestFor: "Taller cups and extra stability",
    detail: "Double stack lift · More mass, more steadiness · Extra insulation",
    tag: "THE EXTRA",
  },
  {
    name: "ORYZO Pro Max",
    stack: 3,
    lift: "3 coasters thick",
    blurb: "Three layers of confidence. For people who like their coffee slightly above it all.",
    description:
      "Maximum stack for maximum unnecessary satisfaction. A bold little pedestal for your mug and a quiet flex for the whole desk.",
    bestFor: "Maximum lift and maximum presence",
    detail: "Triple stack lift · Maximum insulation · Maximum presence",
    tag: "THE MAXIMUM",
  },
] as const;

export function flipMessage(message: string) {
  return Array.from(message).reverse().join("");
}

export const reviewCards = [
  {
    name: "Edan K.",
    role: "NASA astronaut wannabe",
    quote: [
      "“This is the best coaster that I've",
      "ever used. I can't go to the space",
      "without it”",
    ],
    highlight: "best coaster",
    rating: "5/5",
    stars: 5,
    image: "/oryzo/images/testimonies/astronut.webp",
  },
  {
    name: "Gol D. Roger",
    role: "Old-school Pirate",
    quote: [
      "“My coaster? If you want it, I'll let you have it. Look for it! I left everything I gathered together in one place!”",
    ],
    highlight: "one place!",
    rating: "4.5/5",
    stars: 4.5,
    image: "/oryzo/images/testimonies/pirate_king.webp",
  },
  {
    name: "Jamie R.",
    role: "AI influencer, Ex-Web3 influencer",
    quote: ["“We are so cooked. Hollywood is not ready for a coaster this cinematic.”"],
    highlight: "We are so cooked",
    rating: "5/5",
    stars: 5,
    image: "/oryzo/images/testimonies/youtuber.webp",
  },
  {
    name: "Jules M.",
    role: "Minimalist",
    quote: ["“I tried the wearable mode. I achieved… attention.”"],
    highlight: "attention",
    rating: "5/5",
    stars: 5,
    image: "/oryzo/images/testimonies/attention.webp",
  },
  {
    name: "Priya K.",
    role: "Flat Earth believer",
    quote: ["“My table hasn't been this protected since I stopped trusting gravity.”"],
    highlight: "gravity",
    rating: "5/5",
    stars: 5,
    image: "/oryzo/images/testimonies/flat_earth.webp",
  },
] as const;

/** Posters on the horizontally scrolling social wall, in order. Sizes are in 1080-tall artboard pixels. */
export const socialCards = [
  { id: "edge", title: ["Runs on the edge", "Refuses the cloud"], notes: ["On-device."] },
  { id: "sticker_1" },
  {
    id: "always_on",
    title: ["Always On"],
    notes: ["24/7 UPTIME. No power required."],
    cover: true,
  },
  { id: "color" },
  {
    id: "3090",
    title: ["Runs on RTX 3090"],
    notes: ["No More OOM on any consumer GPUs"],
    cover: true,
  },
  { id: "perfect", notes: ["Perfect By Design"] },
  {
    id: "drop_test",
    title: ["Drop-Tested"],
    notes: ["Test conditions: hard surface", "DATE: 02/29/2026", "Damage: The Floor ;)"],
    cover: true,
  },
  { id: "sticker_2" },
  {
    id: "legacy_support",
    title: ["Legacy Support"],
    notes: ["Supporting backward compatibility since the 5th millennium BCE"],
  },
] as const satisfies readonly {
  id: string;
  title?: readonly string[];
  notes?: readonly string[];
  cover?: boolean;
}[];

/** The three tiers of the product chooser and comparison table. */
export const productTiers = [
  {
    name: "ORYZO",
    description:
      "The original. Refined until it feels inevitable. Lifts just enough, grips just right, and quietly disappears into your day like it was never there.",
    extras: ["Single layer lift", "Natural cork insulation", "Stable grip on everyday surfaces"],
    tagline: "One coaster. One job. Done beautifully.",
    stack: "1",
    lift: "1 coaster thick",
    bestFor: "Daily mugs and quiet desks",
  },
  {
    name: "ORYZO Pro",
    description:
      "A little more presence. Double the cork, double the confidence - without losing the plot.",
    extras: ["Double stack lift", "More mass, more steadiness", "Designed to be stardout"],
    tagline: "Twice the cork. Twice the commitment. Still effortless.",
    stack: "2",
    lift: "2 coasters thick",
    bestFor: "Taller cups and extra stability",
  },
  {
    name: "ORYZO Pro Max",
    description:
      "Maximum stack for maximum unnecessary satisfaction. A bold little pedestal for your mug and a quiet flex for the whole desk.",
    extras: [
      "Triple stack lift",
      "Extra insulation by design",
      "Deployable on RTX 3090, on device",
    ],
    tagline: "Three layers of confidence. For people who like their coffee slightly above it all.",
    stack: "3",
    lift: "3 coasters thick",
    bestFor: "Maximum lift and maximum presence",
  },
] as const;

/** Rows every tier shares in the comparison table. */
export const productSharedSpecs = [
  ["Material", "Cork"],
  ["Connectivity", "None"],
  ["Pairing", "Not Required"],
  ["Updates", "Never"],
] as const;
