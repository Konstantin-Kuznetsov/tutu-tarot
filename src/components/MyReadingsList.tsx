"use client";

import Link from "next/link";
import { useRememberedReadings, type RememberedReading } from "./myReadings";

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// "8 – 12 сентября" when the trip stays inside one month, "28 сентября –
// 3 октября" when it crosses one. Built from the ISO string's own parts
// rather than through Date, for the same reason the interchange plan's
// times are: a date stamped 2026-09-08 is the 8th of September wherever it
// is read, and `new Date("2026-09-08").getDate()` can answer 7 west of UTC.
function humanRange(dateFrom: string, dateTo: string): string {
  const [, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [, toMonth, toDay] = dateTo.split("-").map(Number);
  const from = MONTHS[fromMonth - 1];
  const to = MONTHS[toMonth - 1];
  if (!from || !to) return `${dateFrom} – ${dateTo}`;
  return fromMonth === toMonth
    ? `${fromDay} – ${toDay} ${from}`
    : `${fromDay} ${from} – ${toDay} ${to}`;
}

function pluralReadings(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} расклад`;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${count} расклада`;
  return `${count} раскладов`;
}

function pluralTravellers(count: number): string {
  return `${count} чел.`;
}

function ReadingTile({ entry }: { entry: RememberedReading }) {
  return (
    <Link className="reading" href={`/r/${entry.code}`}>
      {/* The thumbnail route, not the 1200x630 social preview: same drawing,
          a quarter of the bytes (105KB against 405KB, measured), and without
          the footer that exists to explain a link to someone who received
          it. Raw <img> rather than next/image -- this is a dynamic route
          whose output is already exactly the size it is displayed at, so an
          optimiser pass would be a second render for nothing.
          eslint-disable-next-line @next/next/no-img-element */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="reading__shot"
        src={`/r/${entry.code}/thumb`}
        alt={`Расклад: ${entry.destinationName}`}
        width={600}
        height={215}
        loading="lazy"
        decoding="async"
      />
      <span className="reading__facts">
        <b>{humanRange(entry.dateFrom, entry.dateTo)}</b>
        <span>
          из города {entry.departureCity} · {pluralTravellers(entry.travelerCount)}
        </span>
      </span>
    </Link>
  );
}

// The list itself, without the page or the dialog around it. Both shells
// show the same thing; only the frame and the way out differ.
export function MyReadingsBody({ heading }: { heading?: React.ReactNode }) {
  const readings = useRememberedReadings();

  return (
    <>
      {heading}
      {readings.length === 0 ? (
        // Also what the server renders, and what the first client commit
        // renders before storage is read -- see myReadings' serverSnapshot.
        <p className="myempty">Здесь появятся расклады, которые вам выпали.</p>
      ) : (
        <>
          <p className="mycount">{pluralReadings(readings.length)}</p>
          <div className="mylist">
            {readings.map((entry) => (
              <ReadingTile key={entry.code} entry={entry} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// The standalone page at /my: reachable directly, bookmarkable, and what a
// visitor with no reading on screen gets. The dialog (MyReadingsDialog) is
// the path from a reading you are still looking at.
export function MyReadingsList() {
  return (
    <main className="myroot">
      <MyReadingsBody
        heading={
          <div className="myhead">
            <h1>Мои расклады</h1>
            <Link href="/">Разложить новый</Link>
          </div>
        }
      />
    </main>
  );
}
