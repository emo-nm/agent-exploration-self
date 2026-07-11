import type { ReactNode } from "react";

export const metadata = {
  title: "Eve vs. Flue — Comparison UI",
  description:
    "Compare Eve and Flue product-agent frameworks, orchestrated by Smithers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
