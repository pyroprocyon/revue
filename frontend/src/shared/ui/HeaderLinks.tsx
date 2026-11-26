import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ACCOUNT_PATH, TODAY_PATH, HOME_PATH, SETS_PATH, signInPath } from '../navigation/paths';
import { usePublicSession } from '../navigation/publicSession';
import { BrandMark } from './BrandMark';
import { accountOutlinedButton } from './buttonStyles';

/** The Revue mark and name link to the home of the current area. */
export function HomeLink({ to, compact = false }: Readonly<{ to?: string; compact?: boolean }>) {
  const session = usePublicSession();
  const destination = session === 'signed-in' ? TODAY_PATH : HOME_PATH;
  return (
    <Link
      to={to ?? destination}
      data-home-link
      className={`pressable -ml-2 inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-[1.5rem] font-extrabold tracking-tight ${compact ? 'workspace-home-link' : 'lg:text-[2.1875rem]'}`}
    >
      <BrandMark className={`size-8 ${compact ? '' : 'lg:size-12'}`} />
      <span>Revue</span>
    </Link>
  );
}

/** A text link on the right of the header, from a set's preview to the list of all sets. */
export function AllSetsLink() {
  return (
    <Link to={SETS_PATH} className="pressable header-link -mr-2 ml-auto">
      All reviewers
    </Link>
  );
}

type BackButtonProps = {
  label: string;
  fallbackPath: string;
  className?: string;
};

/**
 * Goes back one page, like the phone's back gesture. On the first page of a visit, such as a page
 * opened from a shared link, there is nothing to go back to, so it opens `fallbackPath` instead.
 */
export function BackButton({ label, fallbackPath, className = '' }: Readonly<BackButtonProps>) {
  const navigate = useNavigate();
  const location = useLocation();
  // React Router gives the first page of a visit the key "default".
  const isFirstPage = location.key === 'default';

  function goBack() {
    if (isFirstPage) {
      void navigate(fallbackPath);
      return;
    }
    void navigate(-1);
  }

  return (
    <button type="button" onClick={goBack} className={`pressable header-link -ml-2 max-w-full ${className}`}>
      <ChevronLeft aria-hidden="true" />
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </button>
  );
}

export function AccountHeaderLink({ appearance = 'text' }: Readonly<{ appearance?: 'text' | 'account' }>) {
  const location = useLocation();
  const session = usePublicSession();
  const className = appearance === 'account' ? accountOutlinedButton : 'pressable header-link -mr-2 ml-auto';
  if (session === 'checking') return null;
  if (session === 'signed-in')
    return (
      <Link to={ACCOUNT_PATH} className={className}>
        Account
      </Link>
    );
  return (
    <Link to={signInPath(location.pathname)} className={className}>
      Sign in
    </Link>
  );
}
