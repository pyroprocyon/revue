import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SETS_PATH } from '../navigation/paths';
import { primaryButton } from './buttonStyles';
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
      <div className="pt-3">
        <Link to={SETS_PATH} className={`${primaryButton} w-full sm:w-auto`}>
          Browse reviewers
        </Link>
        <WhenSlow>
          <LoadingStatus className="mt-3">Checking your session…</LoadingStatus>
        </WhenSlow>
      </div>
    </PageLayout>
  );
}

export function LoadingScreen({ text, top, trial }: Readonly<{ text: string; top?: ReactNode; trial?: boolean }>) {
  return (
    <StudyLayout top={top ?? <HomeLink />}>
      <div data-trial={trial || undefined} className="review-flow pt-(--review-card-top-gap) pb-4 sm:pb-6">
        <WhenSlow>
          <LoadingPlaceholder kind="study">{text}</LoadingPlaceholder>
        </WhenSlow>
      </div>
    </StudyLayout>
  );
}
