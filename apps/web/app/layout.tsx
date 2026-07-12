import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Agent framework comparison",
  description:
    "Compare Eve, Flue, and Mastra product-agent frameworks, orchestrated by Smithers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
