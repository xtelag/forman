import {
  requestPublicHttps,
  type PublicHttpsRequestInput,
} from "@/server/routes/public-https-request";

export type HttpActionRequestInput = PublicHttpsRequestInput;
export type HttpActionResponse = { body: string | null; status: number };

export async function sendHttpActionRequest(
  input: HttpActionRequestInput,
  requestHttps = requestPublicHttps,
): Promise<HttpActionResponse> {
  const response = await requestHttps({ ...input, responseBodyLimit: input.responseBodyLimit ?? 64 * 1024 });
  if (response.body === undefined || !response.body.trim())
    return { body: null, status: response.status };
  return { body: response.body, status: response.status };
}
