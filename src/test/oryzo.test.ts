import { describe, expect, it } from "vitest";

import { coasterModels, flipMessage } from "@/lib/oryzo";

describe("ORYZO product options and flip demo", () => {
  it("offers exactly one, two, and three coaster stacks", () => {
    expect(coasterModels.map((model) => model.stack)).toEqual([1, 2, 3]);
  });

  it("flips a message in either direction", () => {
    const encoded = flipMessage("ORYZO 123!");

    expect(encoded).toBe("!321 OZYRO");
    expect(flipMessage(encoded)).toBe("ORYZO 123!");
  });
});