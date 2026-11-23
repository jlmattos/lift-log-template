import Link from "next/link";

export type PillItem = {
  /** Link target for this pill. */
  href: string;
  /** Text shown inside the pill. */
  label: string;
  /** Whether this pill is the active/selected one. */
  active: boolean;
};

/**
 * Shared segmented "pill" navigation used for window/period/filter/goal/mode
 * selectors across the app. Replaces the repeated
 * `<div className="flex gap-1 bg-muted/40 rounded-md p-1">…<Link/>…</div>` markup.
 *
 * Each page builds its own `items` list (so the available options stay
 * page-specific), and this component renders the consistent container + pills.
 */
export function PillNav({
  items,
  className = "",
  /** Vertical padding for each pill. Defaults to `py-2`. */
  padY = "py-2",
}: {
  items: PillItem[];
  className?: string;
  padY?: string;
}) {
  return (
    <div className={`flex gap-1 bg-muted/40 rounded-md p-1 ${className}`.trim()}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`flex-1 text-center text-sm ${padY} rounded transition-colors ${
            it.active
              ? "bg-blue-400 text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
