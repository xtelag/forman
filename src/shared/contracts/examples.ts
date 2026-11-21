import { z } from "zod";

export const exampleInputSchema = z
  .object({
    kind: z.enum(["form", "survey"]),
    requestId: z.string().uuid(),
  })
  .strict();
export type ExampleInput = z.infer<typeof exampleInputSchema>;
export type ExampleResult = {
  kind: ExampleInput["kind"];
  name: string;
  sourceId: string;
  pageId: string;
  submissionId: string;
  runId: string;
};
export type ExampleResponse = ExampleResult & {
  sampleStatus: "completed" | "pending" | "failed";
};
