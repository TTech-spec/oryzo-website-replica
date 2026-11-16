import { Fragment, type CSSProperties } from "react";

/** Words of a line with the index each starts at. */
function splitWords(line: string) {
  const words: { word: string; start: number }[] = [];
  let start = 0;
  for (const word of line.split(" ")) {
    words.push({ word, start });
    start += word.length + 1;
  }
  return words;
}

/**
 * Text split into per-character spans so CSS can reveal it letter by letter. Each character
 * gets --n, its position through the whole text from 0 to 1. Words stay unbroken. Characters
 * inside `highlight` (matched within a single line) get the is-marked class.
 */
export function Chars({ lines, highlight }: { lines: readonly string[]; highlight?: string }) {
  const total = lines.reduce((sum, line) => sum + line.replace(/\s/g, "").length, 0);
  let index = 0;
  return (
    <>
      {lines.map((line, lineIndex) => (
        <span className="oz-chars-line" key={lineIndex} aria-hidden="true">
          {splitWords(line).map(({ word, start }, wordIndex, words) => (
            <Fragment key={wordIndex}>
              <span className="oz-chars-word">
                {Array.from(word).map((char, charIndex) => {
                  const n = total > 1 ? index / (total - 1) : 0;
                  index++;
                  const at = start + charIndex;
                  const from = highlight ? line.indexOf(highlight) : -1;
                  const marked = from >= 0 && at >= from && at < from + (highlight?.length ?? 0);
                  return (
                    <i
                      key={charIndex}
                      className={marked ? "is-marked" : undefined}
                      style={{ "--n": n.toFixed(4) } as CSSProperties}
                    >
                      {char}
                    </i>
                  );
                })}
              </span>
              {wordIndex < words.length - 1 ? " " : ""}
            </Fragment>
          ))}
        </span>
      ))}
      <span className="oz-sr-only">{lines.join(" ")}</span>
    </>
  );
}
