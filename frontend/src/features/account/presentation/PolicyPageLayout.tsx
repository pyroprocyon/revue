import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { Screen } from '../../../shared/ui/Screen';

type PolicyPageProps = {
  title: string;
  updated?: string;
  children: ReactNode;
};

export function PolicyPageLayout({ title, updated, children }: Readonly<PolicyPageProps>) {
  return (
    <Screen
      top={<div className="mx-auto"><HomeLink /></div>}
      actions={<Link to={SIGN_IN_PATH} className={`${secondaryButton} w-full`}>Back to sign in</Link>}
    >
      <div className="py-6 sm:py-10 lg:py-14">
        <article className="rounded-card bg-surface p-4 shadow-card sm:p-8">
          <header className="border-b border-line pb-5">
            <h1 className="text-title font-extrabold tracking-tight">{title}</h1>
            {updated && <p className="mt-2 text-support text-muted">Updated {updated}</p>}
          </header>
          <div className="mt-6 space-y-7 text-body">{children}</div>
        </article>
        <div className="flex justify-center"><PolicyLinks showSupport={false} /></div>
      </div>
    </Screen>
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
