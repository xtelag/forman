import { adminRequest } from "./client";
import type {
  ExampleInput,
  ExampleResponse,
} from "@/shared/contracts/examples";
export function createExample(input: ExampleInput) {
  return adminRequest<ExampleResponse>("/api/admin/v1/examples", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
