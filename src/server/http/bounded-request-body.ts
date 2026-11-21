export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "RequestBodyTooLargeError";
  }
}

function declaredBodyLength(request: Request) {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d+$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

export async function readBoundedRequestText(request: Request, maximumBytes: number) {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maximumBytes)
    throw new RequestBodyTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}
