import { cn } from "@/lib/utils";

/** Marque VIGIE : un point de guet (balise) surplombant un V stylisé. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="VIGIE" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8.5 11.5 16 25l7.5-13.5" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground" />
      <circle cx="16" cy="8" r="2.8" className="fill-beacon" />
      <path d="M10.2 5.2a8.2 8.2 0 0 0 0 5.6M21.8 5.2a8.2 8.2 0 0 1 0 5.6" fill="none" strokeWidth="1.4" strokeLinecap="round" className="stroke-beacon" opacity=".7" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {withText && <span className="text-lg font-semibold tracking-[0.18em]">VIGIE</span>}
    </span>
  );
}
