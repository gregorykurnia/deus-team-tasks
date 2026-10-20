// Search matches in --mark (guide 5.6), where the text is shown. The match ignores case; nothing else about the text changes.
import styles from "./Highlight.module.css";

export default function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.mark}>{text.slice(at, at + q.length)}</mark>
      <Highlight text={text.slice(at + q.length)} query={q} />
    </>
  );
}
