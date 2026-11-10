import { Link } from 'react-router';
import { SupportLink } from './SupportLink';
import { textLink } from './buttonStyles';

export function PolicyLinks({ newTab = false }: { newTab?: boolean }) {
  return <nav aria-label="Help and policies" className="mt-6 flex flex-wrap gap-x-6 text-support text-muted">
    <Link to="/privacy" target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined} className={`${textLink} inline-flex min-h-12 min-w-12 items-center`}>Privacy{newTab && <span className="sr-only"> (opens in a new tab)</span>}</Link>
    <Link to="/terms" target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined} className={`${textLink} inline-flex min-h-12 min-w-12 items-center`}>Terms{newTab && <span className="sr-only"> (opens in a new tab)</span>}</Link>
    <SupportLink className="inline-flex min-h-12 min-w-12 items-center">Support</SupportLink>
  </nav>;
}
