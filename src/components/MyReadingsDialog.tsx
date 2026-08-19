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
export function MyReadingsDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // showModal() is imperative by design -- there is no `open` prop that
  // produces a *modal* dialog, only the non-modal `open` attribute -- so the
  // element is driven from an effect rather than rendered open.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // Guarded: jsdom (and any renderer without the dialog element's
      // behaviour) has no showModal, and a missing method must not take the
      // page down over a history panel.
      dialog.showModal?.();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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
