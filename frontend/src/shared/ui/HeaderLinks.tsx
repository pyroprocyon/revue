import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { HOME_PATH, SETS_PATH, SIGN_IN_PATH } from '../navigation/paths';
import { BrandMark } from './BrandMark';
import { accountOutlinedButton } from './buttonStyles';

/** The shared home link, with the Revue mark and name at every screen width. */
export function HomeLink() {
  return (
    <Link
      to={HOME_PATH}
      className="pressable -ml-2 inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-[1.5rem] font-extrabold tracking-tight lg:text-[2.1875rem]"
    >
      <BrandMark className="size-8 lg:size-12" />
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
export function BackButton({ label, fallbackPath }: BackButtonProps) {
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

export function SignInLink({ appearance = 'text' }: { appearance?: 'text' | 'account' }) {
  const location = useLocation();
  const className = appearance === 'account'
    ? accountOutlinedButton
    : 'pressable -mr-2 ml-auto inline-flex min-h-12 items-center rounded-control px-2 text-label font-semibold text-accent';
  return (
    <Link
      to={`${SIGN_IN_PATH}?returnTo=${encodeURIComponent(location.pathname)}`}
      className={className}
    >
      Sign in
    </Link>
  );
}
