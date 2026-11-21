import { createResponsePageResponse } from "@/server/submissions/response-page";

export function GET() {
  return createResponsePageResponse("rate-limited");
}
