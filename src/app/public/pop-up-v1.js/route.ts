import { popUpV1Source } from "@/client/popup/pop-up-v1-source";

export function GET() {
  return new Response(popUpV1Source, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
