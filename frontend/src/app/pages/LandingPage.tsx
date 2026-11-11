import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { usePublicContentQueries } from '../../features/catalog/presentation/PublicContentProvider';
import { accountTonalButton, primaryButton } from '../../shared/ui/buttonStyles';
import { HomeLink, SignInLink } from '../../shared/ui/HeaderLinks';
import { SampleCard } from '../../features/study/presentation/SampleCard';
import { REVIEW_STEPS_INTRO, REVIEW_STEPS_TITLE, ReviewSteps } from '../../features/study/presentation/ReviewSteps';
import { Screen } from '../../shared/ui/Screen';
import { HOW_IT_WORKS_PATH, JOIN_PATH, SETS_PATH } from '../../shared/navigation/paths';

// The phone hero and sample fit above the pinned actions.
// At the lg breakpoint, the sample sits beside the hero and the explanation follows inline.

const HOW_IT_WORKS_SECTION = 'how-it-works';

export function LandingPage() {
  const { hash } = useLocation();
  const { publicSetsQuery } = usePublicContentQueries();
  const queryClient = useQueryClient();

  // Most visitors tap "Browse sets" next, so the list of sets loads now and opens at once.
  useEffect(() => {
    void queryClient.query(publicSetsQuery).catch(() => {
      // The set list owns error feedback when the visitor opens it.
    });
  }, [queryClient, publicSetsQuery]);

  // Old section links still work on phones, where the inline explanation is now hidden.
  if (hash === `#${HOW_IT_WORKS_SECTION}` && window.matchMedia('(width < 64rem)').matches) {
    return <Navigate to={HOW_IT_WORKS_PATH} replace />;
  }

  return (
    <Screen
      wide
      top={<>
        <HomeLink />
        <Link
          to={HOW_IT_WORKS_PATH}
          className="pressable -mr-2 ml-auto inline-flex min-h-12 items-center rounded-control px-2 text-label font-medium text-muted hover:text-accent lg:hidden"
        >
          How it works
        </Link>
        <AccountActions className="ml-auto hidden py-1 lg:flex" />
      </>}
      actions={<LandingActions />}
      actionsOnPhonesOnly
    >
      <section className="flex flex-1 flex-col gap-7 max-lg:justify-center-safe lg:grid lg:flex-none lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-14">
        <HeroText />
        <SampleCard />
      </section>
      <section
        id={HOW_IT_WORKS_SECTION}
        aria-labelledby={`${HOW_IT_WORKS_SECTION}-heading`}
        className="@container hidden scroll-mt-6 lg:block lg:pt-20 lg:pb-12"
      >
        <h2
          id={`${HOW_IT_WORKS_SECTION}-heading`}
          className="text-title font-extrabold tracking-tight text-balance lg:text-title-lg lg:tracking-[-0.02em]"
        >
          {REVIEW_STEPS_TITLE}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-muted lg:text-[1.1875rem]">{REVIEW_STEPS_INTRO}</p>
        <div className="mt-8"><ReviewSteps /></div>
      </section>
    </Screen>
  );
}

function HeroText() {
  return (
    <div className="min-w-0">
      <h1 className="text-hero font-extrabold tracking-[-0.03em] max-lg:[font-size:clamp(2.75rem,6.75dvh,var(--text-hero))] lg:text-hero-lg">
        <span className="block text-accent">Review</span>{' '}
        <span className="block">before</span>{' '}
        <span className="block">
          <span className="relative inline-block">
            {'it’s'}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 -bottom-1.5 h-1.5 rounded-full bg-highlight lg:-bottom-3 lg:h-2.5"
            />
          </span>{' '}
          due.
        </span>
      </h1>
      <p className="mt-4 text-lead font-bold text-balance lg:mt-9 lg:text-lead-lg">
        You do the thinking. Revue handles the timing.
      </p>
      <p className="mt-2 max-w-xl text-body tracking-[0.01em] text-muted lg:mt-3 lg:text-[1.3125rem] lg:leading-[1.45]">
        Got an answer in mind? Flip the card, see how close you got, and rate it.
      </p>
      <div className="mt-8 hidden lg:block">
        <BrowseSetsButton />
      </div>
    </div>
  );
}

function LandingActions() {
  return (
    <div>
      <BrowseSetsButton />
      <AccountActions className="mt-3 flex" />
    </div>
  );
}

function AccountActions({ className }: Readonly<{ className: string }>) {
  return (
    <nav aria-label="Account" className={`${className} flex-wrap gap-3`}>
      <SignInLink appearance="account" />
      <Link to={JOIN_PATH} className={accountTonalButton}>Create account</Link>
    </nav>
  );
}

function BrowseSetsButton() {
  return (
    <Link
      to={SETS_PATH}
      className={`${primaryButton} w-full lg:min-h-14 lg:w-auto lg:gap-3 lg:px-6 lg:shadow-control`}
    >
      <span className="text-lg/6 lg:text-xl/7">Browse sets</span>
      <ArrowRight aria-hidden="true" className="shrink-0" size={20} />
    </Link>
  );
}
