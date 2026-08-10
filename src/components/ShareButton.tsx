"use client";

import { useState } from "react";
import { encodeReading, type SharedReading } from "@/domain/share/code";

type Status = "idle" | "copied" | "error";

const SHARE_TITLE = "Таро-турагент";

interface ShareButtonProps {
  reading: SharedReading;
  destinationName: string;
}

function shareUrlFor(reading: SharedReading): string {
  return `${window.location.origin}/r/${encodeReading(reading)}`;
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

  const shareUrl = shareUrlFor(reading);
  const shareMessage = buildShareMessage(destinationName);
  const telegramUrl = buildTelegramUrl(shareUrl, shareMessage);

  function handleClick() {
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
      <a href={telegramUrl} target="_blank" rel="noreferrer noopener" className="btn btn--secondary">
        Telegram
      </a>
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
