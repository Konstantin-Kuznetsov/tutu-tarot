import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/page";

// The entry screen is now LumoraHero (rendered by RitualStage at the idle
// stage), not the old tarot `.enter` screen. These assertions were rewritten
// against it: the deck fan, the "Туту · сервис путешествий" service line and
// the "Таро-турагент" title all belonged to that earlier screen and no
// longer exist anywhere on the page.
describe("entry screen", () => {
  it("presents the title and the promise", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: "Куда зовёт дорога?" })).toBeInTheDocument();
    // Matched on a fragment, not the whole sentence: the copy carries a <br>
    // mid-sentence, so the surrounding text nodes never normalise to one
    // contiguous string.
    expect(screen.getByText(/колода выбирает маршрут по России/i)).toBeInTheDocument();
  });

  it("puts the search ticket on the page", () => {
    render(<Page />);
    expect(screen.getByLabelText("Откуда")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Когда поедете/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Путешественники")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Разложить карты" })).toBeInTheDocument();
  });

  it("carries the Tutu strapline", () => {
    render(<Page />);
    expect(screen.getByText("Путешествуйте выгодно с Туту")).toBeInTheDocument();
  });

  it("uses a committed local train-window overlay", () => {
    render(<Page />);

    const overlay = document.querySelector(".lumora__overlay");

    expect(overlay).toBeInstanceOf(HTMLImageElement);
    expect(overlay).toHaveAttribute("src", "/hero/train-window-overlay.png");
    expect(existsSync(join(process.cwd(), "public", "hero", "train-window-overlay.png"))).toBe(true);
  });

  it("uses committed local background videos", () => {
    render(<Page />);

    const videos = Array.from(document.querySelectorAll("video.lumora__video"));

    expect(videos).toHaveLength(4);
    for (const video of videos) {
      const src = video.getAttribute("src");

      expect(src).toMatch(/^\/hero\/videos\/.+\.mp4$/);
      expect(src).not.toMatch(/^https?:\/\//);
      expect(existsSync(join(process.cwd(), "public", src ?? ""))).toBe(true);
    }
  });

  it("uses committed local video posters before the videos decode", () => {
    render(<Page />);

    const videos = Array.from(document.querySelectorAll("video.lumora__video"));

    expect(videos).toHaveLength(4);
    for (const video of videos) {
      const poster = video.getAttribute("poster");

      expect(poster).not.toBeNull();
      expect(poster).toMatch(/^\/hero\/posters\/.+\.jpg$/);
      expect(poster).not.toMatch(/^https?:\/\//);
      expect(existsSync(join(process.cwd(), "public", poster ?? ""))).toBe(true);
    }
  });

  it("fills the video layer with the first poster before video paint", () => {
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

    expect(css).toContain("url('/hero/posters/golden-hour.jpg')");
  });

  it("exposes exactly one main landmark", () => {
    render(<Page />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("carries no prototype navigation", () => {
    render(<Page />);
    expect(document.querySelector(".proto-nav")).toBeNull();
  });
});

// The reel used to run every clip at once: all four carried `autoPlay`, so
// the three at opacity 0 kept playing behind the one on screen. Nothing looks
// wrong for the first 28 seconds, and then everything does -- a clip is
// 10.04s and its turn comes round every 4 x 7s, so it reappeared 7.9s into
// itself, showed its last two seconds, wrapped through `loop` and restarted
// in full view. Viewers read that as the same short fragment playing twice.
//
// These pin the two halves of the fix. jsdom implements no playback at all
// (HTMLMediaElement.play throws "Not implemented"), so the methods are
// stubbed and the assertions are about what the component asks the element to
// do -- which is exactly where the bug was.
describe("hero reel plays one clip at a time", () => {
  function stubPlayback() {
    const played: HTMLVideoElement[] = [];
    const paused: HTMLVideoElement[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLVideoElement) {
      played.push(this);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLVideoElement) {
      paused.push(this);
    });
    return { played, paused };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("never lets the browser start all four by itself", () => {
    render(<Page />);

    const videos = Array.from(document.querySelectorAll("video.lumora__video"));

    expect(videos).toHaveLength(4);
    // The attribute is what made every clip run unattended. Playback is the
    // effect's job now, and having both would leave the two racing.
    for (const video of videos) {
      expect(video.hasAttribute("autoplay")).toBe(false);
    }
  });

  it("plays only the clip on screen, and only that one", () => {
    const { played } = stubPlayback();

    render(<Page />);

    const videos = Array.from(document.querySelectorAll("video.lumora__video"));
    const active = document.querySelector('video.lumora__video[data-active="true"]');

    expect(played).toHaveLength(1);
    expect(played[0]).toBe(active);
    expect(played[0]).toBe(videos[0]);
  });

  it("restarts each clip from its first frame when its turn comes round", () => {
    const { played, paused } = stubPlayback();
    vi.useFakeTimers();

    render(<Page />);

    const videos = Array.from(document.querySelectorAll("video.lumora__video")) as HTMLVideoElement[];
    // jsdom has no media pipeline, so currentTime never advances on its own.
    // Winding it forward by hand is what a real clip does while it plays, and
    // it is the state the reset has to overwrite.
    videos[1].currentTime = 7.9;

    // One rotation: 7000ms in LumoraHero.
    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(videos[1].dataset.active).toBe("true");
    // The whole bug in one assertion: it used to resume at 7.9s, show two
    // seconds, wrap through `loop` and start over in full view.
    expect(videos[1].currentTime).toBe(0);
    expect(played.at(-1)).toBe(videos[1]);

    // The outgoing clip keeps running through the 1000ms crossfade -- a frozen
    // frame fading out is more noticeable than a moving one -- and only then
    // stops.
    expect(paused).not.toContain(videos[0]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(paused).toContain(videos[0]);
  });

  it("buffers eagerly only for the clip on screen and the one after it", () => {
    render(<Page />);

    const preloads = Array.from(document.querySelectorAll("video.lumora__video")).map((video) =>
      video.getAttribute("preload"),
    );

    // Every clip used to ask for "auto", which pulled all four at once --
    // ~80MB competing for the connection while the visitor waited on the
    // first frame.
    expect(preloads).toEqual(["auto", "auto", "metadata", "metadata"]);
  });
});
