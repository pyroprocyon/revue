import { Link, useLocation } from 'react-router';
import { TODAY_PATH, HOME_PATH, PRIVACY_PATH, TERMS_PATH } from '../../shared/navigation/paths';
import { OPENED_FROM_HELP, routeState } from '../../shared/navigation/routeState';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { BackButton, HomeLink } from '../../shared/ui/HeaderLinks';
import { PageLayout } from '../../shared/ui/PageLayout';
import { SupportLink } from '../../shared/ui/SupportLink';
import { SessionCheckScreen } from '../../shared/ui/MessageScreen';
import { setSolidControls, useSolidControls } from '../../shared/ui/solidControls';
import { useFocusOnMount } from '../../shared/ui/useFocusOnMount';
import { WorkspaceLayout } from '../../shared/ui/WorkspaceLayout';
import { ArrowUpRight, ChevronRight, FileText, Mail, ShieldCheck } from 'lucide-react';

const helpLink = 'help-directory-row pressable';
const helpIcon = 'size-9 shrink-0 rounded-xl bg-subtle/70 p-2 text-muted @max-[16rem]/help:hidden';
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
  const solidControls = useSolidControls();
  const directoryWidth = signedIn ? 'max-w-[40.625rem] workspace-help-directory' : '';

  return (
    <section className={signedIn ? 'workspace-page' : 'py-6 sm:py-8'}>
      <div className={signedIn ? 'workspace-page-header' : undefined}>
        <BackButton
          label="Back"
          fallbackPath={signedIn ? TODAY_PATH : HOME_PATH}
          className={signedIn ? '@min-[40rem]/workspace:-mt-3' : ''}
        />
        <h1 {...headingFocus} className="text-title font-extrabold tracking-tight outline-none lg:text-title-lg">
          Help
        </h1>
      </div>
      <nav
        aria-label="Help and policies"
        className={`@container/help mt-[1.125rem] grid gap-3 lg:mt-6 ${directoryWidth}`}
      >
        <div className="help-directory-links rounded-[1.25rem] border border-line bg-surface p-1.5">
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
      <section
        aria-labelledby="display-settings-title"
        className={`mt-3 rounded-[1.25rem] border border-line bg-surface p-4 ${directoryWidth}`}
      >
        <h2 id="display-settings-title" className="text-label font-bold">
          Display
        </h2>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-label font-semibold">
          <span>Solid controls</span>
          <input
            type="checkbox"
            checked={solidControls}
            onChange={(event) => setSolidControls(event.currentTarget.checked)}
            aria-describedby="solid-controls-description"
            className="size-5 shrink-0 accent-accent"
          />
        </label>
        <p id="solid-controls-description" className="text-support text-muted">
          Turn off blur on floating navigation and study controls in this browser.
        </p>
      </section>
    </section>
  );
}
