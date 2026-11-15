import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PRIVACY_PATH, TERMS_PATH } from '../navigation/paths';
import { SupportLink } from './SupportLink';
import { textLink } from './buttonStyles';

const policyLinkTarget = 'inline-flex min-h-12 min-w-12 items-center';

type PolicyLinksProps = { newTab?: boolean; showPrivacy?: boolean; showSupport?: boolean };

export function PolicyLinks({ newTab = false, showPrivacy = true, showSupport = true }: Readonly<PolicyLinksProps>) {
  return (
    <nav aria-label="Help and policies" className="mt-6 flex flex-wrap gap-x-6 text-support text-muted">
      {showPrivacy && (
        <PolicyLink to={PRIVACY_PATH} newTab={newTab}>
          Privacy
        </PolicyLink>
      )}
      <PolicyLink to={TERMS_PATH} newTab={newTab}>
        Terms
      </PolicyLink>
      {showSupport && <SupportLink className={policyLinkTarget}>Support</SupportLink>}
    </nav>
  );
}

function PolicyLink({ to, newTab, children }: Readonly<{ to: string; newTab: boolean; children: ReactNode }>) {
  return (
    <Link
      to={to}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer' : undefined}
      className={`${textLink} ${policyLinkTarget}`}
    >
      {children}
      {newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </Link>
  );
}
