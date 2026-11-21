import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@teispace/next-themes";
import { getTheme } from "@teispace/next-themes/server";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Forman", template: "%s · Forman" },
  description: "Self-hosted backend for receiving public form submissions.",
  icons: {
    icon: [
      {
        sizes: "any",
        type: "image/svg+xml",
        url: "/brand/logo-f-ascii.svg",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const initialTheme = await getTheme({ themes: ["light", "dark"] as const });

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          initialTheme={initialTheme ?? "light"}
          storage="hybrid"
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
