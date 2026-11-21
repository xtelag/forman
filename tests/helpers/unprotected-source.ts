import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { createSource } from "@/server/sources/source-service";

/** Explicit fixture for protocol tests that do not exercise CAPTCHA. */
export async function createUnprotectedSource(...args: Parameters<typeof createSource>) {
  const source = await createSource(...args);
  mutateSourceConfiguration(args[0], source.id, () => ({ altchaEnabled: false }));
  return { ...source, altchaEnabled: false };
}
