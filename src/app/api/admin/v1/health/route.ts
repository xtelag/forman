/**
 * Liveness probe for the administration client. It reveals nothing and needs
 * no session: a response only proves the application server is reachable.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
