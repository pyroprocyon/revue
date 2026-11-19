import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, type LinkProps } from 'react-router';

export function NavigationLink({
  back = false,
  className = '',
  children,
  ...link
}: Readonly<LinkProps & { back?: boolean }>) {
  return (
    <Link
      {...link}
      className={`pressable inline-flex min-h-12 min-w-12 max-w-full items-center gap-1.5 rounded-control px-2 text-left font-semibold text-accent active:text-accent-strong ${className}`}
    >
      {back && <ChevronLeft aria-hidden="true" className="size-[1em] shrink-0" />}
      <span className="min-w-0 wrap-anywhere">{children}</span>
      {!back && <ChevronRight aria-hidden="true" className="size-[1em] shrink-0" />}
    </Link>
  );
}
