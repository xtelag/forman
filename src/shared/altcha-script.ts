export const ALTCHA_SCRIPT_PATH = "/vendor/altcha/altcha.js";

export function altchaScriptUrl(referenceUrl: string) {
  return new URL(ALTCHA_SCRIPT_PATH, referenceUrl).toString();
}
