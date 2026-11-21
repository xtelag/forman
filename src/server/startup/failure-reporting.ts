export function isDebugMode(value: string | undefined) {
  return value === "true";
}

export function formatStartupFailure(error: unknown) {
  const detail = error instanceof Error && error.message ? error.message : "Unknown startup error";
  return `× Failed to start: ${detail}`;
}
