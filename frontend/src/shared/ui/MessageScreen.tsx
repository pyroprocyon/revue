import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { HomeLink } from './HeaderLinks';
import { PageLayout } from './PageLayout';
import { useFocusOnMount } from './useFocusOnMount';
import { WhenSlow } from './WhenSlow';

type MessageScreenProps = {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

/**
 * A page-level message, such as an error, an unavailable set or the end of the trial. Its
 * heading takes focus when it appears, because it usually replaces the control that had focus.
 */
export function MessageScreen({ title, icon, action, children }: Readonly<MessageScreenProps>) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <PageLayout top={<HomeLink />} actions={action}>
      <section className="my-6 rounded-card bg-surface px-compact-gutter py-4 shadow-card sm:p-6">
        {icon}
        <h1 ref={headingRef} tabIndex={-1} className="text-title font-extrabold tracking-tight text-balance outline-none">
          {title}
        </h1>
        <div className="mt-3 space-y-3 text-body text-muted">{children}</div>
      </section>
    </PageLayout>
  );
}

export function LoadingScreen({ text }: Readonly<{ text: string }>) {
  return (
    <WhenSlow><PageLayout top={<HomeLink />}>
      <output className="my-6 flex items-center gap-3 rounded-card bg-surface px-compact-gutter py-4 text-body text-muted shadow-card sm:p-6">
        <LoaderCircle aria-hidden="true" className="size-6 shrink-0 animate-spin text-accent motion-reduce:animate-none" />
        <span>{text}</span>
      </output>
    </PageLayout></WhenSlow>
  );
}
