import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@teispace/next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { LoginScreen } from "@/components/auth/login-screen";

describe("LoginScreen", () => {
  afterEach(cleanup);

  test("keeps native administrator credential submission semantics", () => {
    render(<LoginScreen />);

    const form = screen.getByRole("button", { name: "Login" }).closest("form");
    expect(form).toHaveAttribute("action", "/api/admin/v1/auth/login");
    expect(form).toHaveAttribute("method", "post");
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(
      screen.getByText("The Swiss Army knife for web forms and surveys."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter administrator credentials to continue."),
    ).toBeInTheDocument();
  });

  test("shows invalid-credential and changed-password feedback", () => {
    render(<LoginScreen error="invalid" passwordChanged />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The username or password is invalid.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Password changed. Sign in again to continue.",
    );
  });

  test("explains when the administrator session has expired", () => {
    render(<LoginScreen sessionExpired />);

    expect(
      screen.queryByText("Enter administrator credentials to continue."),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Signed out. Sign in again to continue.",
    );
  });
});
