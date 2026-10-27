"use client";

import { usePathname } from "next/navigation";

export function BrandSlogan({ text }: { text: string }) {
  const pathname = usePathname();

  return (
    <span className="gy-slogan">
      <span className="gy-slogan-accessible">{text}</span>
      <span className="gy-slogan-typewriter" key={pathname} aria-hidden="true">
        <span className="gy-slogan-reserve">{text}</span>
        <span className="gy-slogan-typing">{text}</span>
      </span>
    </span>
  );
}
