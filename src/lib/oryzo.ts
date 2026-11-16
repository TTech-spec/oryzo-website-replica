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
    quote: "This is the best coaster that I've ever used. I can't go to the space without it.",
    rating: "5/5",
    image: "/__l5e/assets-v1/2480602f-85f1-430e-847d-c38ca0467adb/review_astronaut.webp",
  },
  {
    name: "Gol D. Roger",
    role: "Old-school pirate",
    quote:
      "My coaster? If you want it, I'll let you have it. Look for it! I left everything I gathered together in one place!",
    rating: "4.5/5",
    image: "/__l5e/assets-v1/a6a1a766-98de-4ede-aa1d-ca61462a44e3/review_pirate.webp",
  },
  {
    name: "Jamie R.",
    role: "AI influencer, ex-Web3 influencer",
    quote: "We are so cooked. Hollywood is not ready for a coaster this cinematic.",
    rating: "5/5",
    image: "/__l5e/assets-v1/0c5adb6a-d075-49d6-8c3a-b98eaeefb919/review_creator.webp",
  },
  {
    name: "Jules M.",
    role: "Minimalist",
    quote: "I tried the wearable mode. I achieved… attention.",
    rating: "5/5",
    image: "/__l5e/assets-v1/99b9bd4b-b615-454f-8738-aff6d4cc93db/review_wearable.webp",
  },
  {
    name: "Priya K.",
    role: "Flat earth believer",
    quote: "My table hasn't been this protected since I stopped trusting gravity.",
    rating: "5/5",
    image: "/__l5e/assets-v1/77b46a63-0584-4475-80ff-986eb5c0e8ee/review_table.webp",
  },
] as const;

export const campaignCards = [
  {
    image: "/__l5e/assets-v1/f4fdb20b-53fa-41dd-960c-0c6e1aedd047/edge.webp",
    eyebrow: "RUNS ON THE EDGE",
    title: "On-device. Always on.",
    note: "24/7 uptime. No power required.",
  },
  {
    image: "/__l5e/assets-v1/7058a325-cc0a-4bd6-bcd6-c8018c2971ba/packaging.webp",
    eyebrow: "LEGACY SUPPORT",
    title: "Good stickers. Better cork.",
    note: "Supporting backward compatibility since the 5th millennium BCE.",
  },
  {
    image: "/__l5e/assets-v1/27e58f23-957a-4341-a045-ac754885f528/always_on.webp",
    eyebrow: "POWERED BY NOTHING",
    title: "Refuses the cloud.",
    note: "No compute. No tokens. No charging cable.",
  },
  {
    image: "/__l5e/assets-v1/c85a312c-6496-42fc-ae71-bdec450a40cc/workstation.webp",
    eyebrow: "LOCAL DEPLOYMENT",
    title: "Runs on RTX 3090.",
    note: "No more OOM on consumer GPUs.",
  },
  {
    image: "/__l5e/assets-v1/48df4f39-39f8-4ac9-ae12-30beed386e14/drop_test.webp",
    eyebrow: "PERFECT BY DESIGN",
    title: "Drop-tested.",
    note: "Test conditions: hard surface. Damage: the floor ;)",
  },
  {
    image: "/__l5e/assets-v1/e0926838-49ae-4952-8f8b-7811472cfffa/legacy.webp",
    eyebrow: "A TABLE, AT REST",
    title: "Spill politely discouraged.",
    note: "One little circle between your mug and the whole table.",
  },
] as const;