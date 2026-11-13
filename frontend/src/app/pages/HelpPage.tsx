import { Link } from 'react-router';
import { ACCOUNT_PATH, HOME_PATH } from '../../shared/navigation/paths';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { textLink } from '../../shared/ui/buttonStyles';
import { BackButton, HomeLink } from '../../shared/ui/HeaderLinks';
import { PageLayout } from '../../shared/ui/PageLayout';
import { SupportLink } from '../../shared/ui/SupportLink';
import { useFocusOnMount } from '../../shared/ui/useFocusOnMount';

const helpLink = 'flex min-h-12 items-center py-2';

export function HelpPage() {
  const session = usePublicSession();
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
    <PageLayout top={<HomeLink />}>
      <section className="py-6 sm:py-8">
        <BackButton label="Back" fallbackPath={session === 'signed-in' ? ACCOUNT_PATH : HOME_PATH} />
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-title font-extrabold tracking-tight outline-none">Help</h1>
        <nav aria-label="Help and policies" className="mt-5 divide-y divide-line rounded-card bg-surface p-compact-gutter shadow-card sm:px-6">
          <Link to="/privacy" state={{ fromHelp: true }} className={`${textLink} ${helpLink}`}>Privacy notice</Link>
          <Link to="/terms" state={{ fromHelp: true }} className={`${textLink} ${helpLink}`}>Terms</Link>
          <SupportLink className={helpLink}>Contact support</SupportLink>
        </nav>
      </section>
    </PageLayout>
  );
}
