export function focusPageHeading() {
  const heading = document.querySelector<HTMLElement>("main h1");
  if (!heading) return;
  heading.tabIndex = -1;
  // Route announcements need focus, but a static heading is not an input.
  heading.style.outline = "none";
  heading.focus({ preventScroll: true });
}

export function restoreFocusAfterDialog() {
  requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body)
      focusPageHeading();
  });
}
