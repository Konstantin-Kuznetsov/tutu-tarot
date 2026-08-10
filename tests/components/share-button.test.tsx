import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/ShareButton";
import type { SharedReading } from "@/domain/share/code";

const reading: SharedReading = {
  cards: [
    { id: "tower", reversed: false },
    { id: "hermit", reversed: true },
    { id: "chariot", reversed: false },
  ],
  destinationId: "altai-chuysky",
  mode: "railway",
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

function stubNavigatorProp(name: string, value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
}

function deleteNavigatorProp(name: string) {
  Reflect.deleteProperty(window.navigator, name);
}

afterEach(() => {
  deleteNavigatorProp("share");
  deleteNavigatorProp("clipboard");
  vi.unstubAllGlobals();
});

describe("ShareButton", () => {
  it("uses navigator.share when it is available", () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigatorProp("share", share);

    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    fireEvent.click(screen.getByRole("button", { name: /Поделиться/ }));

    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0][0] as { url: string };
    expect(shared.url).toMatch(/\/r\/[A-Za-z0-9_-]+$/);
  });

  it("falls back to writing the URL to the clipboard when share is absent", async () => {
    deleteNavigatorProp("share");
    const write = vi.fn().mockResolvedValue(undefined);
    stubNavigatorProp("clipboard", { write });

    // jsdom doesn't implement ClipboardItem itself; stand in with a class
    // that just records what it was built from, so the assertions below
    // can check ShareButton actually constructed it (not just called
    // clipboard.writeText some other way).
    class FakeClipboardItem {
      items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);

    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    fireEvent.click(screen.getByRole("button", { name: /Поделиться/ }));

    // Asserted immediately, with nothing awaited in this test yet: the
    // clipboard write has to happen synchronously inside the click handler.
    // Safari revokes the click's user-activation the instant anything is
    // awaited ahead of the clipboard call, so `await x(); new
    // ClipboardItem(...)` silently fails on iPhone even though it works on
    // desktop Chrome -- this is the assertion that would catch that bug.
    expect(write).toHaveBeenCalledTimes(1);
    const [item] = write.mock.calls[0][0] as [InstanceType<typeof FakeClipboardItem>];
    expect(item).toBeInstanceOf(FakeClipboardItem);
    expect(item.items["text/plain"]).toBeInstanceOf(Promise);

    await screen.findByText(/скопирован/i);
  });

  it("reports failure visibly rather than silently when both are unavailable", async () => {
    deleteNavigatorProp("share");
    deleteNavigatorProp("clipboard");

    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    fireEvent.click(screen.getByRole("button", { name: /Поделиться/ }));

    await screen.findByText(/не удалось/i);
  });

  it("renders the Telegram share control", () => {
    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    const telegramLink = screen.getByRole("link", { name: /Telegram/ });
    expect(telegramLink).toBeInTheDocument();
  });

  it("encodes both URL and message in the Telegram share href", () => {
    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    const telegramLink = screen.getByRole("link", { name: /Telegram/ });
    const href = telegramLink.getAttribute("href");

    expect(href).toContain("https://t.me/share/url?");
    expect(href).toContain("url=");
    expect(href).toContain("text=");
    expect(href).toContain(encodeURIComponent("Карты выбрали для меня «Горный Алтай». Загляните в расклад:"));
  });

  it("opens the Telegram link in a new tab with security attributes", () => {
    render(<ShareButton reading={reading} destinationName="Горный Алтай" />);
    const telegramLink = screen.getByRole("link", { name: /Telegram/ });

    expect(telegramLink.getAttribute("target")).toBe("_blank");
    expect(telegramLink.getAttribute("rel")).toBe("noreferrer noopener");
  });
});
