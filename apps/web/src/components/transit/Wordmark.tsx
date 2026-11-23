/**
 * Site mark: four line inks meeting at one interchange ring, then "Apps" with a small
 * "by DevDAJ". The ring is the encrypted folder every app shares.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
        <path
          d="M3 9h7l4 5"
          fill="none"
          stroke="var(--line-scarlet)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v11"
          fill="none"
          stroke="var(--line-cobalt)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M25 9h-7l-4 5"
          fill="none"
          stroke="var(--line-green)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 14v11"
          fill="none"
          stroke="var(--line-amber)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle
          cx="14"
          cy="14"
          r="4.2"
          fill="var(--background)"
          stroke="var(--foreground)"
          strokeWidth="2.4"
        />
      </svg>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">Apps</span>
        <span className="text-xs font-medium text-muted-foreground">by DevDAJ</span>
      </span>
    </span>
  );
}
