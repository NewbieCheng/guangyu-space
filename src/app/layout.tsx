import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/guangyu-space.css";

export const metadata: Metadata = {
  title: { default: "光域空间", template: "%s · 光域空间" },
  description: "让事业，多一种可能。个人 OPC 经营管理空间。",
  icons: [{ rel: "icon", url: "/brand/guangyu-logo-icon.png" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="gy-body">{children}</body>
    </html>
  );
}
