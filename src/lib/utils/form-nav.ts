/**
 * "Next" on the phone keyboard (and Enter on a desktop) jumps to the next data-entry field
 * instead of doing nothing – fields opt in with the attribute data-entry-input.
 */
export function focusNextEntry(from: HTMLElement, root: HTMLElement | null): void {
  const nodes = Array.from(root?.querySelectorAll<HTMLElement>("[data-entry-input]") ?? []).filter((el) => !el.hasAttribute("disabled"));
  const next = nodes[nodes.indexOf(from) + 1];
  if (!next) {
    from.blur();
    return;
  }
  next.focus({ preventScroll: true });
  if (next instanceof HTMLInputElement && next.type !== "date") next.select();
  next.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** onKeyDown handler for the container around the fields. */
export function enterMovesToNext(e: React.KeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  const el = e.target as HTMLElement;
  if (e.key !== "Enter" || e.shiftKey || !el.hasAttribute("data-entry-input")) return;
  if (el.tagName === "TEXTAREA") return; // Enter makes a new line there
  e.preventDefault();
  focusNextEntry(el, root);
}
