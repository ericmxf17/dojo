import { Link } from "@tanstack/react-router";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-forest">
      <svg width="35" height="34" viewBox="0 0 40 36" fill="none" aria-hidden="true">
        <path
          d="M5 26a15 15 0 0 1 30 0M5 27h30a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6M15 7l4 4 7-8"
          stroke="currentColor"
          strokeWidth="3.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="text-[29px] font-semibold">sidework</span>}
    </span>
  );
}
export function HomeLogo() {
  return (
    <Link to="/" aria-label="Sidework home">
      <Logo />
    </Link>
  );
}
