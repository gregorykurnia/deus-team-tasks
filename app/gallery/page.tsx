import { notFound } from "next/navigation";
import Icon, { ICON_NAMES, type IconSize } from "@/ui/Icon";
import { Buttons, Empty, Meters, Notices, OptionChips, Overlays, People, Pills, Tags } from "./sections";

// Dev-only page for checking the design's components against the prototype. Production answers 404.
const SIZES: IconSize[] = [13, 14, 15, 16, 17, 18, 19, 20, 21];

export default function Gallery() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-6 py-10">
      <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-ink">Components</h1>
      <p className="mt-2 text-muted">The design’s icons and display components, each in its states.</p>

      <section id="icons" aria-labelledby="icons-title" className="mt-12">
        <h2 id="icons-title" className="text-[15px] font-extrabold text-ink">
          Icons ({ICON_NAMES.length})
        </h2>
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex flex-col items-center gap-2 rounded-m bg-glass-strong px-3 py-4 text-ink">
              <Icon name={name} size={21} />
              <code className="text-xs text-muted">{name}</code>
            </li>
          ))}
        </ul>
        <ul className="mt-6 flex items-end gap-6 text-ink">
          {SIZES.map((size) => (
            <li key={size} className="flex flex-col items-center gap-1 text-xs text-muted">
              <Icon name="sun" size={size} />
              {size}px
            </li>
          ))}
        </ul>
      </section>

      <Buttons />
      <Pills />
      <Tags />
      <OptionChips />
      <People />
      <Notices />
      <Empty />
      <Meters />
      <Overlays />
    </main>
  );
}
