import type { ReactNode } from 'react';
import { HomeLink } from './HeaderLinks';
import { LoadingPlaceholder, LoadingStatus } from './LoadingFeedback';
import { PageLayout } from './PageLayout';
import { StudyLayout } from './StudyLayout';
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
  const headingFocus = useFocusOnMount<HTMLHeadingElement>();
  return (
    <PageLayout top={<HomeLink />} actions={action}>
      <section className="my-6 rounded-card bg-surface px-compact-gutter py-4 shadow-card sm:p-6">
        {icon}
        <h1 {...headingFocus} className="text-title font-extrabold tracking-tight text-balance outline-none">
          {title}
        </h1>
        <div className="mt-3 space-y-3 text-body text-muted">{children}</div>
      </section>
    </PageLayout>
  );
}

export function SessionCheckScreen() {
  return (
    <PageLayout top={<HomeLink />}>
      <WhenSlow>
        <LoadingStatus className="my-3">Checking your session…</LoadingStatus>
      </WhenSlow>
    </PageLayout>
  );
}

export function LoadingScreen({ text, top }: Readonly<{ text: string; top?: ReactNode }>) {
  return (
    <StudyLayout top={top ?? <HomeLink />}>
      <WhenSlow>
        <LoadingPlaceholder kind="study" className="my-3">
          {text}
        </LoadingPlaceholder>
      </WhenSlow>
    </StudyLayout>
  );
}
