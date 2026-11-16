import type { CSSProperties } from "react";

/**
 * Text whose letters roll up one after another to a copy of themselves while the nearest
 * `.oz-flip-host` (or the text itself) is hovered. Timing follows the original: the whole roll
 * lasts 1 / (2 + 4 / letters) seconds, each letter taking 60% of it.
 */
export function FlipText({ text }: { text: string }) {
  const chars = Array.from(text);
  const duration = 1 / (2 + 4 / Math.max(1, chars.length));
  return (
    <span
      className="oz-flip"
      style={{ "--flip-d": `${duration}s` } as CSSProperties}
      aria-label={text}
    >
      {chars.map((char, i) => (
        <span
          className="oz-flip-char"
          aria-hidden="true"
          key={i}
          style={{ "--n": chars.length > 1 ? i / (chars.length - 1) : 0 } as CSSProperties}
        >
          <span>
            {char === " " ? " " : char}
            <span className="oz-flip-copy">{char === " " ? " " : char}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
