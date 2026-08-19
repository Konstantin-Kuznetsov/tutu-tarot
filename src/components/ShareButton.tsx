"use client";

import { useEffect, useState } from "react";
import { MyReadingsDialog } from "./MyReadingsDialog";
import { encodeReading, type SharedReading } from "@/domain/share/code";

type Status = "idle" | "copied" | "error";


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

// window.location.origin never changes for the life of this tab (no
// same-tab navigation happens away from this component without a full
// reload), so there is nothing to subscribe to -- a stable no-op is exactly
// what useSyncExternalStore wants here. Declared at module scope so its
// identity never changes across renders.
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
  // Task 13 fix-round-2 report). useSyncExternalStore is the React-sanctioned
  // way to read a browser-only value like this: readServerOrigin (null)
  // supplies the server/first-hydration-pass snapshot so the server render
  // and the client's first render agree (no Telegram anchor yet, no
  // hydration mismatch) -- readOrigin supplies the true value on every
  // client render after that, with no setState-in-effect render cascade
  // (react-hooks/set-state-in-effect) to produce it.


  // «Ссылка скопирована» is an acknowledgement, not a state: it answers the
  // click and then has no business staying on screen. Three seconds is long
  // enough to be read and short enough that it never becomes furniture.
  //
  // Only the success clears itself. The error keeps the link in its own
  // text so it can be copied by hand -- taking that away on a timer would
  // remove the only way out of the failure it is reporting.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 3000);
    // Cleared on a re-click too, not just on unmount: a second copy restarts
    // the three seconds instead of inheriting whatever was left of the first.
    return () => window.clearTimeout(timer);
  }, [status]);

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
    // Back to idle first, so a second copy is a real state transition and
    // the effect above restarts its three seconds. Without this, setting
    // "copied" while already "copied" changes nothing, React does not
    // re-render, and the message would still vanish on the first click's
    // timer.
    setStatus("idle");

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
      {/* Quieter than the button beside it, and last: sharing acts on the
          reading in front of you, while this only looks past it. Opens over
          the reading rather than navigating away -- a reading costs a Tutu
          search to produce, and glancing at your history should not cost you
          one. Rendered here because this row is the only place in the app
          where a traveller is done reading and looking for what to do next. */}
      <MyReadingsDialog />
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
