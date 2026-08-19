"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundaries must be Client Components (see Next's error.js docs) --
// this one catches whatever SharedReadingLive's search/narration path
// throws that isn't already handled as a graceful fallback (searchTutuOffers
// itself never throws; this is for the genuinely unexpected: a bug, an
// out-of-memory, a crash inside React's own streaming renderer). Before this
// file existed, a failure here fell through to Next's generic, unstyled
// error page -- a jarring, off-voice landing for someone who just tapped a
// friend's link.
export default function SharedReadingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="reading-table">
      <main className="result share-fallback">
        <h1>Таро-турагент</h1>
        <p className="ritual-status" role="alert">
          Расклад прервался на середине пути — карты снова рассыпались.
        </p>
        <button type="button" className="btn" onClick={() => retry()}>
          Попробовать снова
        </button>
        <Link className="btn btn--secondary" href="/">Разложить свой расклад</Link>
      </main>
    </div>
  );
}
