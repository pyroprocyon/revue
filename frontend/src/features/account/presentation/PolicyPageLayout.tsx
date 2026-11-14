import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { TODAY_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { usePublicSession } from '../../../shared/navigation/publicSession';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';

type PolicyPageProps = {
  title: string;
  updated?: string;
  children: ReactNode;
};

export function PolicyPageLayout({ title, updated, children }: Readonly<PolicyPageProps>) {
  const session = usePublicSession();
  const location = useLocation();
  const fromHelp = location.state?.fromHelp === true;
  // A link to a section scrolls to that section, so only a plain visit moves focus to the title.
  const opensAtSection = location.hash !== '';
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const navigate = useNavigate();
  const signedIn = session === 'signed-in';
  const back = session !== 'checking' && (
    <Link to={signedIn ? TODAY_PATH : SIGN_IN_PATH} className={`${secondaryButton} w-full`}>
      {signedIn ? 'Back to Today' : 'Back to sign in'}
    </Link>
  );
  return (
    <PageLayout
      top={<div className="mx-auto"><HomeLink /></div>}
      actions={fromHelp ? (
        <button type="button" className={`${secondaryButton} w-full`} onClick={() => void navigate(-1)}>Back to Help</button>
      ) : back}
      pinActionsOnPhone
    >
      <div className="py-6 sm:py-10 lg:py-14">
        <article className="rounded-card bg-surface p-4 shadow-card sm:p-8">
          <header className="border-b border-line pb-5">
            <h1 ref={opensAtSection ? undefined : heading} tabIndex={-1} className="text-title font-extrabold tracking-tight outline-none">{title}</h1>
            {updated && <p className="mt-2 text-support text-muted">Updated {updated}</p>}
          </header>
          <div className="mt-6 space-y-7 text-body">{children}</div>
        </article>
        <div className="flex justify-center"><PolicyLinks showSupport={false} /></div>
      </div>
    </PageLayout>
  );
}

export function PolicySection({ id, title, children }: Readonly<{ id?: string; title: string; children: ReactNode }>) {
  return (
    <section id={id} className="space-y-2">
      <h2 className="text-section font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
