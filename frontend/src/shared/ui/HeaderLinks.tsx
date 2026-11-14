import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ACCOUNT_PATH, TODAY_PATH, HOME_PATH, SETS_PATH, SIGN_IN_PATH } from '../navigation/paths';
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
      className={`pressable -ml-2 inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-[1.5rem] font-extrabold tracking-tight ${compact ? '' : 'lg:text-[2.1875rem]'}`}
    >
      <BrandMark className={`size-8 ${compact ? '' : 'lg:size-12'}`} />
      <span>Revue</span>
    </Link>
  );
}

/** A text link on the right of the header, from a set's preview to the list of all sets. */
export function AllSetsLink() {
  return (
    <Link
      to={SETS_PATH}
      className="pressable -mr-2 ml-auto inline-flex min-h-12 items-center rounded-control px-2 text-label font-semibold text-accent lg:text-body"
    >
      All sets
    </Link>
  );
}

type BackButtonProps = {
  label: string;
  fallbackPath: string;
};

/**
 * Goes back one page, like the phone's back gesture. On the first page of a visit, such as a page
 * opened from a shared link, there is nothing to go back to, so it opens `fallbackPath` instead.
 */
export function BackButton({ label, fallbackPath }: Readonly<BackButtonProps>) {
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
    <button
      type="button"
      onClick={goBack}
      className="pressable -ml-2 inline-flex min-h-12 min-w-0 items-center gap-1 rounded-control px-2 text-left text-label font-semibold text-muted"
    >
      <ChevronLeft aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
      {label}
    </button>
  );
}

export function AccountHeaderLink({ appearance = 'text' }: Readonly<{ appearance?: 'text' | 'account' }>) {
  const location = useLocation();
  const session = usePublicSession();
  const className = appearance === 'account'
    ? accountOutlinedButton
    : 'pressable -mr-2 ml-auto inline-flex min-h-12 items-center rounded-control px-2 text-label font-semibold text-accent';
  if (session === 'checking') return null;
  if (session === 'signed-in') return <Link to={ACCOUNT_PATH} className={className}>Account</Link>;
  return (
    <Link
      to={`${SIGN_IN_PATH}?returnTo=${encodeURIComponent(location.pathname)}`}
      className={className}
    >
      Sign in
    </Link>
  );
}
