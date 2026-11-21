import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CodeBlock } from "@/components/api-docs/code-block";

vi.mock("shiki/bundle/web", () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre style="background-color:#fff;color:#24292f"><code><span class="token keyword">curl</span></code></pre>'),
}));

describe("CodeBlock", () => {
  test("renders Shiki-highlighted markup on the neutral code surface", async () => {
    render(<CodeBlock code="curl https://forman.test" label="curl" />);

    expect(await screen.findByTestId("syntax-highlighted-code")).toHaveTextContent("curl");
    expect(screen.getByTestId("syntax-highlighted-code").querySelector("pre")?.getAttribute("style")).not.toContain("background-color");
  });
});
