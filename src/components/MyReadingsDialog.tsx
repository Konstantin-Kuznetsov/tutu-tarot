"use client";

import { useEffect, useRef, useState } from "react";
import { MyReadingsBody } from "./MyReadingsList";

// The history over the reading rather than instead of it. As a route, opening
// «Мои расклады» threw away whatever you were looking at and left the way
// back to it a browser button; a reading takes a Tutu search to produce, so
// glancing at your history should not cost you one.
//
// A real <dialog> opened with showModal(), not a hand-rolled overlay: it
// brings focus trapping, Escape, an inert background and ::backdrop with it.
// Every one of those is somewhere accessibility bugs breed when written by
// hand, and the calendar's own popover (role="dialog" plus a keydown
// listener) is a popover, not a modal -- it does not need any of them.
// Releases the page and puts it back where it was. Split out so the close
// path and the unmount cleanup cannot drift apart.
function unpin(scrollY: number): void {
  const { body } = document;
  if (body.style.position !== "fixed") return;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  window.scrollTo(0, scrollY);
}

export function MyReadingsDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Where the reading was when the dialog took over. showModal() moves focus
  // into the dialog and the browser scrolls that focus into view -- and this
  // dialog lives in the share row, near the foot of a long reading, so
  // opening it jumped the page behind from 300 to 1518 and closing left it
  // there (measured). You would come back from a glance at your history and
  // find yourself somewhere else in your own reading.
  const restoreTo = useRef(0);

  // showModal() is imperative by design -- there is no `open` prop that
  // produces a *modal* dialog, only the non-modal `open` attribute -- so the
  // element is driven from an effect rather than rendered open.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      restoreTo.current = window.scrollY;
      // Pin the page where it is *before* opening. showModal moves focus
      // into the dialog and the browser scrolls that into view; this dialog
      // sits at the foot of a long reading, so opening it threw the page to
      // the very bottom (300 -> 1518, measured) and closing left it there.
      //
      // Two simpler fixes were tried and neither works. `overflow: hidden`
      // on the root stops the wheel but not showModal's own scroll -- and
      // once it is applied the viewport cannot be scrolled back
      // programmatically either, so the jump becomes permanent. Restoring on
      // the next frame fails for the same reason. Pinning avoids the
      // question: a fixed body has nothing to scroll and nothing to
      // scroll into view.
      const { body } = document;
      body.style.position = "fixed";
      body.style.top = `${-restoreTo.current}px`;
      body.style.left = "0";
      body.style.right = "0";
      // Guarded: jsdom (and any renderer without the dialog element's
      // behaviour) has no showModal, and a missing method must not take the
      // page down over a history panel.
      dialog.showModal?.();
    } else if (!open) {
      // Not `!open && dialog.open`: Escape closes the dialog itself, so by
      // the time this runs the element is already shut and that condition
      // never held -- which left the page pinned with no dialog on screen
      // to explain why. The close is guarded, the unpin is not.
      if (dialog.open) dialog.close();
      unpin(restoreTo.current);
    }
  }, [open]);

  // Unmounting while open would otherwise leave the page pinned forever --
  // a reading nobody can scroll, with no dialog on screen to explain why.
  useEffect(() => () => unpin(restoreTo.current), []);

  return (
    <>
      <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
        Мои расклады
      </button>
      <dialog
        ref={ref}
        className="mydialog"
        aria-label="Мои расклады"
        // Fires for Escape as well as close(), so state follows the element
        // instead of the two drifting apart the first time the browser
        // closes it without us.
        onClose={() => setOpen(false)}
        // The backdrop is part of the dialog element, so a click on it lands
        // here rather than on any child. Comparing the target to the dialog
        // itself is what tells "clicked outside" from "clicked the list".
        onClick={(event) => {
          if (event.target === ref.current) setOpen(false);
        }}
      >
        <div className="mydialog__panel">
          <MyReadingsBody
            heading={
              <div className="myhead">
                <h1>Мои расклады</h1>
                <button type="button" className="mydialog__close" onClick={() => setOpen(false)}>
                  Закрыть
                </button>
              </div>
            }
          />
        </div>
      </dialog>
    </>
  );
}
