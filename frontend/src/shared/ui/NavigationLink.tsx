import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, type LinkProps } from 'react-router';

export function NavigationLink({
  back = false,
  className = '',
  children,
  ...link
}: Readonly<LinkProps & { back?: boolean }>) {
  return (
    <Link {...link} className={`pressable header-link max-w-full ${className}`}>
      {back && <ChevronLeft aria-hidden="true" />}
      <span className="min-w-0 wrap-anywhere">{children}</span>
      {!back && <ChevronRight aria-hidden="true" />}
    </Link>
  );
}
