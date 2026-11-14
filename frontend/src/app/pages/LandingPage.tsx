import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { usePublicContentQueries } from '../../features/catalog/presentation/PublicContentProvider';
import { accountTonalButton, primaryButton } from '../../shared/ui/buttonStyles';
import { AccountHeaderLink, HomeLink } from '../../shared/ui/HeaderLinks';
import { SampleCard } from '../../features/study/presentation/SampleCard';
import { REVIEW_STEPS_INTRO, REVIEW_STEPS_TITLE, ReviewSteps } from '../../features/study/presentation/ReviewSteps';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { LandingLayout } from './LandingLayout';
import { LoadingScreen } from '../../shared/ui/MessageScreen';
import { TODAY_PATH, HOW_IT_WORKS_PATH, JOIN_PATH, SETS_PATH } from '../../shared/navigation/paths';

// Compact phones use a two-line hero; narrower screens and enlarged text can scroll.
// At the lg breakpoint, the sample sits beside the hero and the explanation follows inline.

const HOW_IT_WORKS_SECTION = 'how-it-works';

export function LandingPage() {
  const { hash } = useLocation();
  const session = usePublicSession();
  const { publicSetsQuery } = usePublicContentQueries();
  const queryClient = useQueryClient();
  const scrollToGuide = useCallback((section: HTMLElement | null) => {
    // The section may mount after ScrollOnNavigation has already handled this URL.
    if (hash === `#${HOW_IT_WORKS_SECTION}`) section?.scrollIntoView();
  }, [hash]);

  // Most visitors tap "Browse sets" next, so the list of sets loads now and opens at once.
  useEffect(() => {
    if (session !== 'signed-out') return;
    void queryClient.query(publicSetsQuery).catch(() => {
      // The set list owns error feedback when the visitor opens it.
    });
  }, [queryClient, publicSetsQuery, session]);

  if (session === 'checking') return <LoadingScreen text="Checking your session…" />;

  // Old section links still work on phones, where the inline explanation is now hidden.
  if (hash === `#${HOW_IT_WORKS_SECTION}` && (session === 'signed-in' || window.matchMedia('(width < 64rem)').matches)) {
    return <Navigate to={HOW_IT_WORKS_PATH} replace />;
  }

  if (session === 'signed-in') return <Navigate to={TODAY_PATH} replace />;

  return (
    <LandingLayout
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
    >
      <section className="flex flex-1 flex-col gap-4 max-lg:justify-center-safe sm:gap-8 lg:grid lg:flex-none lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-14">
        <HeroText />
        <SampleCard />
      </section>
      <section
        ref={scrollToGuide}
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
    </LandingLayout>
  );
}

function HeroText() {
  return (
    <div className="landing-hero min-w-0">
      <h1 className="text-hero font-extrabold tracking-[-0.03em] max-sm:text-hero-compact lg:text-hero-lg">
        <span className="text-accent lg:block">Review</span>{' '}
        <span className="lg:block">before</span>{' '}
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
      <div className="landing-hero-copy mt-4 lg:mt-9">
        <p className="text-lead font-bold text-balance max-sm:text-xl/6 lg:text-lead-lg">
          You do the thinking. Revue handles the timing.
        </p>
        <p className="mt-2 max-w-xl text-body tracking-[0.01em] text-muted max-sm:text-base/6 lg:mt-3 lg:text-[1.3125rem] lg:leading-[1.45]">
          Got an answer in mind? Flip the card, see how close you got, and rate it.
        </p>
      </div>
      <div className="landing-browse-in-hero mt-8 hidden lg:block">
        <BrowseSetsButton />
      </div>
    </div>
  );
}

function LandingActions() {
  return (
    <div>
      <div className="landing-browse-in-footer mb-3 flex">
        <BrowseSetsButton />
      </div>
      <AccountActions className="flex" />
    </div>
  );
}

function AccountActions({ className }: Readonly<{ className: string }>) {
  const session = usePublicSession();
  if (session === 'checking') return null;
  return (
    <nav aria-label="Account" className={`${className} flex-wrap gap-3`}>
      <AccountHeaderLink appearance="account" />
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
