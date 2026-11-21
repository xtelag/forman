/** Keep the selected section in the URL without adding a history entry. */
export function replaceLocationHash(value: string) {
  const url = new URL(window.location.href);
  url.hash = value;
  window.history.replaceState(window.history.state, "", url);
}
