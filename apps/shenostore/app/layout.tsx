import type { Metadata } from "next";

// ShenoDev design tokens. Single source of truth lives in @shenodev/ui, a
// Tailwind v4 theme that mirrors docs/UI_UX_Brief.md. Nothing here hardcodes a
// brand colour; utilities resolve through the shared theme.
import "@shenodev/ui/theme.css";

export const metadata: Metadata = {
  title: "ShenoStore",
  description: "Storefront for ShenoDev tenants.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
