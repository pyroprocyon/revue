import { Link } from 'react-router';
import { REVIEW_STEPS_INTRO, REVIEW_STEPS_TITLE, ReviewSteps } from '../../features/study/presentation/ReviewSteps';
import { SETS_PATH } from '../../shared/navigation/paths';
import { primaryButton } from '../../shared/ui/buttonStyles';
import { HomeLink } from '../../shared/ui/HeaderLinks';
import { Screen } from '../../shared/ui/Screen';
import { useFocusOnMount } from '../../shared/ui/useFocusOnMount';

export function HowItWorksPage() {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Screen
      top={<HomeLink />}
      actions={<Link to={SETS_PATH} className={`${primaryButton} w-full sm:w-auto`}>Browse sets</Link>}
    >
      <section className="@container py-4 sm:py-8 lg:py-12">
        <div className="rounded-card bg-highlight-soft p-4 sm:p-6">
          <h1 ref={headingRef} tabIndex={-1} className="text-title font-extrabold tracking-tight text-balance outline-none">
            {REVIEW_STEPS_TITLE}
          </h1>
          <p className="mt-3 text-body text-muted">{REVIEW_STEPS_INTRO}</p>
        </div>
        <div className="mt-4 rounded-card bg-surface p-4 shadow-card sm:p-6">
          <ReviewSteps />
        </div>
      </section>
    </Screen>
  );
}
