"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/chat", label: "Live chat" },
  { href: "/transcripts", label: "Transcripts" },
  { href: "/evals", label: "Scorecards" },
  { href: "/compare", label: "Two lenders" },
  { href: "/health", label: "Account health" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      <div className="container nav-inner">
        <Link href="/" className="brand">Mortgage Agent Lab</Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href || path.startsWith(l.href + "/") ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
