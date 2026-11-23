/**
 * Common SheetContent className: caps to 85% dynamic viewport height (which shrinks
 * when the iOS keyboard is open) and allows internal scrolling.
 *
 * Combine with `onFocus={scrollFocusedIntoView}` on inputs to keep them visible
 * when the keyboard pops up.
 */
export const SHEET_SCROLL_CLASS = "rounded-t-2xl max-h-[85dvh] overflow-y-auto";

/**
 * Scrolls a focused input into the visible area after the iOS keyboard finishes animating.
 * The 300ms delay matches typical iOS keyboard animation.
 */
export function scrollFocusedIntoView(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  const target = e.target;
  setTimeout(
    () => target.scrollIntoView({ block: "center", behavior: "smooth" }),
    300
  );
}
