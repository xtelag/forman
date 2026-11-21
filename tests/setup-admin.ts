import { createElement, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { vi } from "vitest";

// Component tests use the same library context as the admin shell. Keep caller
// wrappers inside it so rerender retains both application and test providers.
vi.mock("@testing-library/react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@testing-library/react")>();
  const render = (
    ui: Parameters<typeof actual.render>[0],
    options?: Parameters<typeof actual.render>[1],
  ) =>
    actual.render(ui, {
      ...options,
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          MantineProvider,
          { env: "test", withCssVariables: false, withGlobalClasses: false },
          options?.wrapper
            ? createElement(options.wrapper, null, children)
            : children,
        ),
    });
  return { ...actual, render };
});

// jsdom does not implement FontFaceSet; Mantine autosize listens for loaded fonts.
if (!document.fonts)
  Object.defineProperty(document, "fonts", {
    value: new EventTarget(),
    configurable: true,
  });
