import type { ReactNode } from 'react';
import { CircleHelp, House, LibraryBig, UserRound } from 'lucide-react';
import { NavLink, useMatch } from 'react-router';
import { ACCOUNT_PATH, DECK_ROUTE, HELP_PATH, LIBRARY_PATH, NEW_DECK_PATH, TODAY_PATH } from '../navigation/paths';
import { OPENED_FROM_WORKSPACE } from '../navigation/routeState';
import { HomeLink } from './HeaderLinks';
import { SkipToContent } from './LayoutParts';

type WorkspaceLayoutProps = {
  children: ReactNode;
  navigationDisabled?: boolean;
  onTabWhileChecking?: (path: string) => void;
};

const destinations = [
  { to: TODAY_PATH, label: 'Today', icon: House },
  { to: LIBRARY_PATH, label: 'Library', icon: LibraryBig },
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
  const desktopWidth = today || (deck && !newDeck) ? '@min-[64rem]/workspace:max-w-wide' : '';
  return (
    <div className="workspace-container">
      <SkipToContent />
      <div className="workspace-layout">
        <header className="workspace-chrome workspace-header-gutters">
          <div className="workspace-brand">
            <HomeLink to={TODAY_PATH} compact />
          </div>
          <nav aria-label="Your workspace" className="workspace-navigation" inert={navigationDisabled}>
            {destinations.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={navigationLink}
                onClick={(event) => {
                  if (
                    !onTabWhileChecking ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onTabWhileChecking(to);
                }}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <NavLink
            to={HELP_PATH}
            state={OPENED_FROM_WORKSPACE}
            className={({ isActive }) => `${navigationLink({ isActive })} workspace-help`}
          >
            <CircleHelp aria-hidden="true" className="size-5 shrink-0" />
            <span>Help</span>
          </NavLink>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content @container outline-none">
          <div className={`mx-auto w-full max-w-3xl @min-[64rem]/workspace:pt-6 ${desktopWidth}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
