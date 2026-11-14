import { Link, useLocation } from 'react-router';
import { TODAY_PATH, HOME_PATH } from '../../shared/navigation/paths';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { textLink } from '../../shared/ui/buttonStyles';
import { BackButton, HomeLink } from '../../shared/ui/HeaderLinks';
import { PageLayout } from '../../shared/ui/PageLayout';
import { SupportLink } from '../../shared/ui/SupportLink';
import { LoadingScreen } from '../../shared/ui/MessageScreen';
import { useFocusOnMount } from '../../shared/ui/useFocusOnMount';
import { WorkspaceLayout } from '../../shared/ui/WorkspaceLayout';
import { ArrowUpRight, ChevronRight, FileText, Mail, ShieldCheck } from 'lucide-react';

const helpLink = 'flex min-h-16 items-center gap-3 py-4';

export function HelpPage() {
  const session = usePublicSession();
  const location = useLocation();
  const openedFromWorkspace = (location.state as { fromWorkspace?: boolean } | null)?.fromWorkspace === true;
  // The workspace's Help link vouches for the session, so its layout stays while the check finishes.
  if (session === 'signed-in' || (session === 'checking' && openedFromWorkspace)) {
    return <WorkspaceLayout><HelpContent signedIn /></WorkspaceLayout>;
  }
  if (session === 'checking') return <LoadingScreen text="Checking your session…" />;
  return <PageLayout top={<HomeLink />}><HelpContent signedIn={false} /></PageLayout>;
}

function HelpContent({ signedIn }: Readonly<{ signedIn: boolean }>) {
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
      <section className={signedIn ? '' : 'py-6 sm:py-8'}>
        <BackButton label="Back" fallbackPath={signedIn ? TODAY_PATH : HOME_PATH} />
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-title font-extrabold tracking-tight outline-none lg:text-title-lg">Help</h1>
        <nav aria-label="Help and policies" className="mt-6 divide-y divide-line rounded-card bg-surface px-compact-gutter py-2 shadow-card sm:mt-8 sm:px-8">
          <SupportLink className={helpLink}><Mail aria-hidden="true" className="size-5 shrink-0 text-muted" /><span className="flex-1">Contact support</span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></SupportLink>
          <Link to="/privacy" state={{ fromHelp: true }} className={`${textLink} ${helpLink}`}><ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-muted" /><span className="flex-1">Privacy notice</span><ChevronRight aria-hidden="true" className="size-5 shrink-0" /></Link>
          <Link to="/terms" state={{ fromHelp: true }} className={`${textLink} ${helpLink}`}><FileText aria-hidden="true" className="size-5 shrink-0 text-muted" /><span className="flex-1">Terms</span><ChevronRight aria-hidden="true" className="size-5 shrink-0" /></Link>
        </nav>
      </section>
  );
}
