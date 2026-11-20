import { Link, useLocation } from 'react-router';
import { TODAY_PATH, HOME_PATH, PRIVACY_PATH, TERMS_PATH } from '../../shared/navigation/paths';
import { OPENED_FROM_HELP, routeState } from '../../shared/navigation/routeState';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { BackButton, HomeLink } from '../../shared/ui/HeaderLinks';
import { PageLayout } from '../../shared/ui/PageLayout';
import { SupportLink } from '../../shared/ui/SupportLink';
import { SessionCheckScreen } from '../../shared/ui/MessageScreen';
import { useFocusOnMount } from '../../shared/ui/useFocusOnMount';
import { WorkspaceLayout } from '../../shared/ui/WorkspaceLayout';
import { ArrowUpRight, ChevronRight, FileText, Mail, ShieldCheck } from 'lucide-react';
import { HomeScreenHelp } from './HomeScreenHelp';

const helpLink = 'help-directory-row pressable';
const helpIcon = 'size-9 shrink-0 rounded-xl bg-accent-soft/60 p-2 text-accent-strong';
const linkArrow = 'size-4 shrink-0 text-muted';

export function HelpPage() {
  const session = usePublicSession();
  const location = useLocation();
  const openedFromWorkspace = routeState(location).fromWorkspace === true;
  // The workspace's Help link vouches for the session, so its layout stays while the check finishes.
  if (session === 'signed-in' || (session === 'checking' && openedFromWorkspace)) {
    return (
      <WorkspaceLayout>
        <HelpContent signedIn />
      </WorkspaceLayout>
    );
  }
  if (session === 'checking') return <SessionCheckScreen />;
  return (
    <PageLayout top={<HomeLink />}>
      <HelpContent signedIn={false} />
    </PageLayout>
  );
}

function HelpContent({ signedIn }: Readonly<{ signedIn: boolean }>) {
  const headingFocus = useFocusOnMount<HTMLHeadingElement>();

  return (
    <section className={signedIn ? '' : 'py-6 sm:py-8'}>
      {/* A back control above a title keeps its 48 px target but starts in the page's top padding. */}
      <BackButton label="Back" fallbackPath={signedIn ? TODAY_PATH : HOME_PATH} className="-mt-3" />
      <h1 {...headingFocus} className="text-title font-extrabold tracking-tight outline-none lg:text-title-lg">
        Help
      </h1>
      <nav
        aria-label="Help and policies"
        className="mt-[1.125rem] max-w-[40.625rem] overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-xs lg:mt-6"
      >
        <HomeScreenHelp />
        <div className="mx-3.5 divide-y divide-line lg:mx-[1.375rem]">
          <SupportLink className={helpLink}>
            <Mail aria-hidden="true" className={helpIcon} />
            <span className="flex-1">Contact support</span>
            <ArrowUpRight aria-hidden="true" className={linkArrow} />
          </SupportLink>
          <Link to={PRIVACY_PATH} state={OPENED_FROM_HELP} className={helpLink}>
            <ShieldCheck aria-hidden="true" className={helpIcon} />
            <span className="flex-1">Privacy notice</span>
            <ChevronRight aria-hidden="true" className={linkArrow} />
          </Link>
          <Link to={TERMS_PATH} state={OPENED_FROM_HELP} className={helpLink}>
            <FileText aria-hidden="true" className={helpIcon} />
            <span className="flex-1">Terms</span>
            <ChevronRight aria-hidden="true" className={linkArrow} />
          </Link>
        </div>
      </nav>
    </section>
  );
}
