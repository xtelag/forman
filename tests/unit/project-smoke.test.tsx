import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FormanBrand } from "@/components/brand/forman-brand";

describe("FormanBrand", () => {
  test("shows the approved neutral product mark without a legacy mascot or slogan", () => {
    render(<FormanBrand />);

    expect(screen.getByRole("region", { name: "Forman" })).toBeInTheDocument();
    expect(screen.queryByText("Sources in. Data ready.")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Forman mascot" })).not.toBeInTheDocument();
  });
});
