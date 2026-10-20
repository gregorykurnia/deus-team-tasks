// Meters: a person's load (five bars, guide 4.5) and a likelihood (five rising bars with its word, guide 4.12).
import styles from "./Meter.module.css";

export function LoadMeter({ load, total = 5 }: { load: number; total?: number }) {
  return (
    <span className={styles.load} role="img" aria-label={`Load ${load} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} data-lit={i < load || undefined} />
      ))}
    </span>
  );
}

// 5 is Very High and 1 is Low, as the notes list them. null means not rated.
export type Rating = 1 | 2 | 3 | 4 | 5;
const WORDS: Record<Rating, string> = { 5: "Very high", 4: "High", 3: "Medium", 2: "Moderately low", 1: "Low" };

export function LikelihoodMeter({ rating }: { rating: Rating | null }) {
  const unrated = rating === null;
  return (
    <span className={`${styles.likely} ${unrated ? styles.unrated : ""}`.trim()}>
      <span className={styles.bars} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} data-lit={!unrated && i <= rating ? true : undefined} />
        ))}
      </span>
      <span className={styles.word}>{unrated ? "Not rated" : WORDS[rating]}</span>
    </span>
  );
}
