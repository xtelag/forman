type ResponsePageKind = "invalid" | "rate-limited" | "unavailable";

const pages: Record<ResponsePageKind, { body: string; status: number; title: string }> = {
  invalid: { body: "The submission could not be accepted. Review the form and try again.", status: 400, title: "Submission not accepted" },
  "rate-limited": { body: "Too many submissions were received. Please wait a moment and try again.", status: 429, title: "Please try again later" },
  unavailable: { body: "This form is currently unavailable. Please try again later.", status: 503, title: "Source unavailable" },
};

export function createResponsePageResponse(kind: ResponsePageKind) {
  const page = pages[kind];
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${page.title} · Forman</title><style>*,::before,::after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{align-items:center;display:flex;justify-content:center;min-height:100vh;padding:1.5rem}.card{background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;box-shadow:0 1px 2px rgb(15 23 42 / .05);max-width:28rem;padding:1.5rem;width:100%}h1{font-size:1.5rem;line-height:2rem;margin:0}p{color:#64748b;line-height:1.5;margin:.5rem 0 0}</style></head><body><main><section class="card"><h1>${page.title}</h1><p>${page.body}</p></section></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: page.status,
  });
}
