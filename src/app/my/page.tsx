import type { Metadata } from "next";
import { MyReadingsList } from "@/components/MyReadingsList";

export const metadata: Metadata = {
  title: "Мои расклады — Таро-турагент",
  description: "Расклады, которые выпали вам в этом браузере.",
};

// Nothing here is server data: the history lives in the browser's own
// storage, so the page is a shell around a client component. It renders the
// empty state on the server and fills in on the client's first commit --
// see myReadings' serverSnapshot for why both sides must agree.
export default function MyReadingsPage() {
  return (
    <div className="reading-table">
      <MyReadingsList />
    </div>
  );
}
