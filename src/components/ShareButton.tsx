"use client";

import { useEffect, useState } from "react";
import { encodeReading, type SharedReading } from "@/domain/share/code";

type Status = "idle" | "copied" | "error";

const SHARE_TITLE = "Таро-турагент";

interface ShareButtonProps {
  reading: SharedReading;
  destinationName: string;
}

// Takes `origin` as a parameter rather than reading `window.location.origin`
// itself: this function is called both from the click handler (always
// browser-only, `window` is safe there) and from the Telegram anchor's href,
// which needs a value at render time -- including the server render of
// /r/[code] (see the Task 13 fix-round-2 report), where `window` does not
// exist at all. Keeping this function itself window-free means neither
// caller has to guard it; each caller supplies an origin it already knows is
// safe to read.
function shareUrlFor(origin: string, reading: SharedReading): string {
  return `${origin}/r/${encodeReading(reading)}`;
}

function buildShareMessage(destinationName: string): string {
  return `Карты выбрали для меня «${destinationName}». Загляните в расклад:`;
}

function buildTelegramUrl(shareUrl: string, message: string): string {
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(message);
  return `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
}

export function ShareButton({ reading, destinationName }: ShareButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  // Held alongside `status`, not derived from it: this button also renders
  // from the "/" page mid-ritual, where the browser's own address bar
  // never contains the code (it lives in React state until this click
  // mints it) -- so the error state has to show the link itself rather
  // than point at "the page address", which would be actively wrong there.
  const [url, setUrl] = useState<string | null>(null);

  // This component is rendered inside /r/[code], a server-rendered route,
  // where `window` does not exist -- so the origin can't be read in the
  // component body (that crashed the server render before this fix; see the
  // Task 13 fix-round-2 report). It's resolved after mount instead, in an
  // effect, and starts null so the server render and the client's first
  // render agree (no Telegram anchor yet) -- no hydration mismatch, and no
  // placeholder link built from the wrong origin.
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareMessage = buildShareMessage(destinationName);
  const telegramUrl = origin ? buildTelegramUrl(shareUrlFor(origin, reading), shareMessage) : null;

  function handleClick() {
    // Reads window.location.origin directly here rather than reusing the
    // `origin` state above: a click can only ever happen in the browser, so
    // `window` is always safe inside this handler -- exactly as it was
    // before the Telegram control moved shareUrlFor into the component body
    // (commit 05f7617). Not depending on the mount effect's state means
    // "Поделиться раскладом" keeps working on the very first click, even if
    // that click somehow lands before the effect has run.
    const shareUrl = shareUrlFor(window.location.origin, reading);
    setUrl(shareUrl);

    if (typeof navigator.share === "function") {
      // Fire-and-forget: the OS share sheet owns its own UI from here, and
      // a user who cancels it makes navigator.share() reject -- that is not
      // a failure this button needs to report.
      navigator.share({ title: SHARE_TITLE, text: shareMessage, url: shareUrl }).catch(() => {});
      return;
    }

    // Everything below must run with no `await` ahead of the clipboard
    // call. Safari revokes the click's user-activation the instant
    // anything is awaited first, so `await something(); new
    // ClipboardItem(...)` silently fails on iPhone even though the same
    // code works in desktop Chrome -- see the ShareButton comment in the
    // Task 13 brief. The ClipboardItem is built here, synchronously, from a
    // *promise*-valued blob; only the promise's resolution is deferred, not
    // the call to `clipboard.write` itself.
    try {
      if (typeof navigator.clipboard?.write === "function" && typeof ClipboardItem === "function") {
        const item = new ClipboardItem({
          "text/plain": Promise.resolve(new Blob([shareUrl], { type: "text/plain" })),
        });
        navigator.clipboard.write([item]).then(
          () => setStatus("copied"),
          () => setStatus("error"),
        );
        return;
      }

      if (typeof navigator.clipboard?.writeText === "function") {
        navigator.clipboard.writeText(shareUrl).then(
          () => setStatus("copied"),
          () => setStatus("error"),
        );
        return;
      }
    } catch {
      setStatus("error");
      return;
    }

    // Neither the share sheet nor any clipboard API exists -- fail
    // visibly, in the product's own voice, rather than leave the click
    // looking like it did nothing.
    setStatus("error");
  }

  return (
    <div className="share-row">
      <button type="button" className="btn" onClick={handleClick}>
        Поделиться раскладом
      </button>
      {telegramUrl ? (
        <a href={telegramUrl} target="_blank" rel="noreferrer noopener" className="btn btn--secondary">
          Telegram
        </a>
      ) : null}
      {status === "copied" ? (
        <p className="share-row__status" role="status">
          Ссылка скопирована
        </p>
      ) : null}
      {status === "error" ? (
        <p className="share-row__status share-row__status--error" role="alert">
          Не удалось скопировать — скопируйте ссылку вручную: <span className="share-row__url">{url}</span>
        </p>
      ) : null}
    </div>
  );
}
