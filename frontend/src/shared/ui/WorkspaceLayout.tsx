import type { MouseEvent, ReactNode } from 'react';
import { BookOpen, House, LibraryBig, UserRound } from 'lucide-react';
import { NavLink, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';
import {
  ACCOUNT_PATH,
  DECK_ROUTE,
  HELP_PATH,
  LIBRARY_PATH,
  NEW_DECK_PATH,
  PUBLISHED_PATH,
  TODAY_PATH,
  savedSetListParams,
} from '../navigation/paths';
import { routeState } from '../navigation/routeState';
import { HomeLink } from './HeaderLinks';
import { SkipToContent } from './LayoutParts';
import { NavigationLink } from './NavigationLink';
import { WorkspaceHelpLink } from './WorkspaceHelpLink';

type WorkspaceLayoutProps = {
  children: ReactNode;
  navigationDisabled?: boolean;
  onTabWhileChecking?: (path: string) => void;
};

const destinations = [
  { to: TODAY_PATH, label: 'Today', icon: House },
  { to: LIBRARY_PATH, label: 'Library', icon: LibraryBig },
  { to: PUBLISHED_PATH, label: 'Browse', icon: BookOpen },
  { to: ACCOUNT_PATH, label: 'Account', icon: UserRound },
];

function navigationLink({ isActive }: Readonly<{ isActive: boolean }>) {
  return `workspace-link pressable ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted'}`;
}

/** One set of destinations adapts from a phone tab bar to a desktop sidebar. */
export function WorkspaceLayout({
  children,
  navigationDisabled = false,
  onTabWhileChecking,
}: Readonly<WorkspaceLayoutProps>) {
  const today = useMatch(TODAY_PATH);
  const deck = useMatch(DECK_ROUTE);
  const newDeck = useMatch(NEW_DECK_PATH);
  const library = useMatch(LIBRARY_PATH);
  const account = useMatch(ACCOUNT_PATH);
  const published = useMatch(PUBLISHED_PATH);
  const help = useMatch(HELP_PATH);
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const savedSet = library && params.get('shelf') === 'saved' && params.has('set');
  const libraryShelf = library && !savedSet;
  const compact = Boolean(today || libraryShelf || newDeck || published || help);
  const mainTab = Boolean(today || libraryShelf || published || account);
  const onDeckPage = (deck !== null && newDeck === null) || savedSet;
  const backTo = savedSet ? `${LIBRARY_PATH}?${savedSetListParams(params)}` : LIBRARY_PATH;
  const backState = savedSet ? routeState(location) : undefined;
  const openAfterCheck = (to: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onTabWhileChecking || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onTabWhileChecking(to);
  };
  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (onTabWhileChecking) {
      openAfterCheck(backTo)(event);
    } else if (backState?.fromSavedSetList) {
      event.preventDefault();
      void navigate(-1);
    }
  }
  return (
    <div className="workspace-container">
      <SkipToContent />
      <div
        className="workspace-layout"
        data-compact={compact || undefined}
        data-main-tab={mainTab || undefined}
        data-saved-set={savedSet || undefined}
        data-heading-help={Boolean(today || published) || undefined}
        data-help-page={Boolean(help) || undefined}
      >
        <header className="workspace-chrome page-gutters">
          <div className={onDeckPage ? 'workspace-brand workspace-brand-replaced-by-back' : 'workspace-brand'}>
            <HomeLink to={TODAY_PATH} compact />
          </div>
          {onDeckPage && (
            <NavigationLink
              to={backTo}
              state={backState && { previousCursors: backState.previousCursors }}
              back
              aria-label="Back to Library"
              className="workspace-back"
              inert={navigationDisabled}
              onClick={goBack}
            >
              Library
            </NavigationLink>
          )}
          <nav aria-label="Your workspace" className="workspace-navigation" inert={navigationDisabled}>
            {destinations.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} aria-label={label} className={navigationLink} onClick={openAfterCheck(to)}>
                <span className="workspace-link-content">
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span>{label}</span>
                </span>
              </NavLink>
            ))}
          </nav>
          <WorkspaceHelpLink />
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content page-gutters @container outline-none">
          <div className="mx-auto w-full max-w-3xl @min-[64rem]/workspace:max-w-wide @min-[64rem]/workspace:pt-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
