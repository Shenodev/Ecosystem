import type { Metadata } from "next";

// ShenoDev design tokens. Single source of truth lives in @shenodev/ui, which
// mirrors docs/UI_UX_Brief.md. Nothing here hardcodes a brand colour.
import "@shenodev/ui/tokens.css";
import "@shenodev/ui/primary-button.css";

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
