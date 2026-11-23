import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Page header with a back-chevron link, title, and optional subtitle.
 * `trailing` renders extra controls on the right side of the header row.
 */
export function BackHeader({
  backHref,
  title,
  subtitle,
  truncateSubtitle = false,
  className = "mb-2",
  trailing,
}: {
  backHref: string;
  title: string;
  subtitle?: ReactNode;
  truncateSubtitle?: boolean;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </Link>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle != null && (
          <p className={`text-xs text-muted-foreground${truncateSubtitle ? " truncate" : ""}`}>
            {subtitle}
          </p>
        )}
      </div>
      {trailing}
    </div>
  );
}
