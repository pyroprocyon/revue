import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useEffect, useId } from 'react';
import { Link } from 'react-router';
import { usePublicContentQueries } from '../../features/catalog/presentation/PublicContentProvider';
import { chip, primaryButton, textLink } from '../../shared/ui/buttonStyles';
import { HomeLink, SignInLink } from '../../shared/ui/HeaderLinks';
import { NextReviewPanel } from '../../features/study/presentation/NextReviewPanel';
import { ReviewSteps } from '../../features/study/presentation/ReviewSteps';
import { Screen } from '../../shared/ui/Screen';
import { SETS_PATH } from '../../shared/navigation/paths';
import { RatingTag } from '../../features/study/presentation/ratings';

// The landing page follows the November 7 concept: the hero, a sample review, then the three
// steps. On phones the page scrolls and "Browse sets" stays pinned at the bottom, like every
// screen's main action. From 1024 pixels wide the button sits in the hero and the sample review
// stands beside it.

const HOW_IT_WORKS_SECTION = 'how-it-works';
const NO_ACCOUNT_NOTE = 'No account needed. Practice isn’t saved.';

export function LandingPage() {
  const { publicSetsQuery } = usePublicContentQueries();
  const queryClient = useQueryClient();

  // Most visitors tap "Browse sets" next, so the list of sets loads now and opens at once.
  useEffect(() => {
    void queryClient.prefetchQuery(publicSetsQuery);
  }, [queryClient, publicSetsQuery]);

  const phoneActions = (
    <div>
      <BrowseSetsButton />
      <p className="mt-2 text-center text-support text-muted">{NO_ACCOUNT_NOTE}</p>
    </div>
  );
  return (
    <Screen wide top={<><HomeLink /><SignInLink /></>} actions={phoneActions} actionsOnPhonesOnly>
      <section className="grid gap-10 pt-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-14">
        <HeroText />
        <SampleCard />
      </section>
      <section
        id={HOW_IT_WORKS_SECTION}
        aria-labelledby={`${HOW_IT_WORKS_SECTION}-heading`}
        className="@container scroll-mt-6 pt-14 pb-6 lg:pt-20 lg:pb-12"
      >
        <h2
          id={`${HOW_IT_WORKS_SECTION}-heading`}
          className="text-title font-extrabold tracking-tight text-balance lg:text-title-lg lg:tracking-[-0.02em]"
        >
          How Revue decides when cards come back
        </h2>
        <div className="mt-6 lg:mt-8">
          <ReviewSteps />
        </div>
      </section>
    </Screen>
  );
}

function HeroText() {
  return (
    <div className="min-w-0">
      <h1 className="text-hero font-extrabold tracking-[-0.03em] lg:text-hero-lg">
        <span className="block text-accent">Review</span>{' '}
        <span className="block">before</span>{' '}
        <span className="block">
          <span className="relative inline-block">
            it’s
            <span
              aria-hidden="true"
              className="absolute inset-x-0 -bottom-1.5 h-1.5 rounded-full bg-highlight lg:-bottom-3 lg:h-2.5"
            />
          </span>{' '}
          due.
        </span>
      </h1>
      <p className="mt-6 text-lead font-bold lg:mt-9 lg:text-lead-lg">
        You focus on remembering. Revue handles the timing.
      </p>
      <p className="mt-3 max-w-xl text-body tracking-[0.01em] text-muted lg:text-[1.3125rem] lg:leading-[1.45]">
        Practice a question, check your answer, and rate how well you remembered. Revue uses your ratings to decide
        when you’ll see each card again.
      </p>
      {/* Phones only: desktops show the steps right after the hero. */}
      <a
        href={`#${HOW_IT_WORKS_SECTION}`}
        className={`${textLink} mt-2 inline-flex min-h-12 items-center text-body font-semibold lg:hidden`}
      >
        How it works
      </a>
      <div className="mt-8 hidden lg:block">
        <BrowseSetsButton />
        <p className="mt-3 text-[1.0625rem] text-muted">{NO_ACCOUNT_NOTE}</p>
      </div>
    </div>
  );
}

function BrowseSetsButton() {
  return (
    <Link
      to={SETS_PATH}
      className={`${primaryButton} w-full lg:min-h-14 lg:w-auto lg:min-w-[17.75rem] lg:px-8`}
    >
      <span className="text-[1.25rem] lg:text-[1.375rem]">Browse sets</span>
      <ArrowRight aria-hidden="true" size={24} strokeWidth={2.25} />
    </Link>
  );
}

/**
 * An illustrative card built from the trial's own parts: the rating tag and the next-review
 * panel. Nothing in it is a control, and "Example schedule" says the interval is only an example,
 * because real intervals depend on each student's history.
 */
function SampleCard() {
  const captionId = useId();
  return (
    <figure aria-labelledby={captionId} className="min-w-0 rounded-card bg-surface p-4 shadow-card sm:p-6 lg:p-8">
      <figcaption id={captionId} className={`${chip} lg:text-base`}>
        Sample card
      </figcaption>
      <p className="mt-4 text-section font-extrabold tracking-tight lg:mt-6 lg:text-[2.0625rem] lg:leading-[1.1] lg:tracking-[-0.01em]">
        Who wrote Noli Me Tangere?
      </p>
      <p className="mt-2 text-body lg:mt-6 lg:text-[1.875rem] lg:leading-[1.2]">José Rizal</p>
      <div className="mt-4 lg:mt-6 lg:text-[1.25rem]">
        <RatingTag rating="hard" />
      </div>
      <div className="mt-4 lg:mt-6">
        <NextReviewPanel label="Comes back" when="Tomorrow" note="Example schedule" />
      </div>
    </figure>
  );
}
