// The PrepFusion wordmark, matching the public site: a rounded ink tile with a
// P in it, then "Prep" in the surrounding ink and "Fusion" in the wordmark
// blue.
//
// NEVER uppercase this — the mark is "PrepFusion", not "PREPFUSION".
export default function Brand({ large = false }) {
  return (
    <span className={`bm${large ? ' bm-lg' : ''}`}>
      <span className="bm-mono" aria-hidden="true">
        P
      </span>
      <span className="bm-text">
        Prep<b>Fusion</b>
      </span>
    </span>
  );
}
