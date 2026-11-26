import { useCallback, useRef, type Ref } from 'react';
import { Link, useLocation } from 'react-router';
import { TODAY_PATH, HOME_PATH, PRIVACY_PATH, TERMS_PATH } from '../../shared/navigation/paths';
import { OPENED_FROM_HELP, routeState } from '../../shared/navigation/routeState';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { BackButton, HomeLink } from '../../shared/ui/HeaderLinks';
import { PageLayout } from '../../shared/ui/PageLayout';
import { SupportLink } from '../../shared/ui/SupportLink';
import { setSolidControls, useSolidControls } from '../../shared/ui/solidControls';
import { WorkspaceLayout } from '../../shared/ui/WorkspaceLayout';
import { ArrowUpRight, ChevronRight, FileText, Mail, ShieldCheck } from 'lucide-react';

const helpLink = 'help-directory-row pressable';
const helpIcon = 'size-9 shrink-0 rounded-xl bg-accent-soft p-2 text-accent @max-[16rem]/help:hidden';
const linkArrow = 'size-4 shrink-0 text-muted';

export function HelpPage() {
  const session = usePublicSession();
  const location = useLocation();
  const openedFromWorkspace = routeState(location).fromWorkspace === true;
  const useWorkspace = session === 'signed-in' || (session === 'checking' && openedFromWorkspace);
  const focusedControlIndex = useRef(-1);
  const helpSection = useCallback((section: HTMLElement | null) => {
    if (!section) return;
    const shell = section.closest('[data-help-layout]');
    const controls = [
      ...(shell?.querySelectorAll<HTMLElement>('a[href="#main-content"], [data-home-link]') ?? []),
      ...section.querySelectorAll<HTMLElement>('a[href], button, input'),
    ];
    const target = controls[focusedControlIndex.current];
    target?.focus();
    if (!target || document.activeElement !== target) section.querySelector('h1')?.focus();
    return () => {
      const activeControl = document.activeElement;
      focusedControlIndex.current = activeControl instanceof HTMLElement ? controls.indexOf(activeControl) : -1;
    };
  }, []);
  const content = <HelpContent sectionRef={helpSection} signedIn={useWorkspace} />;
  return (
    <div className="contents" data-help-layout>
      {useWorkspace ? (
        <WorkspaceLayout>{content}</WorkspaceLayout>
      ) : (
        <PageLayout top={<HomeLink />}>{content}</PageLayout>
      )}
    </div>
  );
}

function HelpContent({ signedIn, sectionRef }: Readonly<{ signedIn: boolean; sectionRef: Ref<HTMLElement> }>) {
  const solidControls = useSolidControls();

  return (
    <section ref={sectionRef} className={`settings-page ${signedIn ? 'workspace-page' : 'py-6 sm:py-8'}`}>
      <div className={signedIn ? 'workspace-page-header' : undefined}>
        <BackButton
          label="Back"
          fallbackPath={signedIn ? TODAY_PATH : HOME_PATH}
          className={signedIn ? '@min-[40rem]/workspace:-mt-3' : ''}
        />
        <h1 tabIndex={-1} className="text-title font-extrabold tracking-tight outline-none lg:text-title-lg">
          Help
        </h1>
      </div>
      <nav aria-label="Help and policies" className="@container/help mt-4">
        <div className="help-directory-links rounded-card border border-line bg-surface p-1.5">
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
        className="mt-3 rounded-card border border-line bg-surface p-4 sm:p-5"
      >
        <h2 id="display-settings-title" className="text-label font-bold">
          Display
        </h2>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-label font-semibold">
          <span>Solid controls</span>
          <span className="relative h-6 w-11 shrink-0">
            <input
              type="checkbox"
              role="switch"
              checked={solidControls}
              onChange={(event) => setSolidControls(event.currentTarget.checked)}
              aria-describedby="solid-controls-description"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span className="settings-switch-track" aria-hidden="true" />
          </span>
        </label>
        <p id="solid-controls-description" className="text-support text-muted">
          Turn off blur on floating navigation and study controls in this browser.
        </p>
      </section>
    </section>
  );
}
