import type { ReactNode } from 'react';
import { CircleHelp, House, LibraryBig, UserRound } from 'lucide-react';
import { NavLink } from 'react-router';
import { ACCOUNT_PATH, HELP_PATH, LIBRARY_PATH, TODAY_PATH } from '../navigation/paths';
import { HomeLink } from './HeaderLinks';
import { SkipToContent } from './LayoutParts';

type WorkspaceLayoutProps = {
  children: ReactNode;
  navigationDisabled?: boolean;
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
export function WorkspaceLayout({ children, navigationDisabled = false }: Readonly<WorkspaceLayoutProps>) {
  return (
    <div className="workspace-container">
      <SkipToContent />
      <div className="workspace-layout">
        <header className="workspace-chrome workspace-header-gutters">
          <div className="workspace-brand"><HomeLink to={TODAY_PATH} compact /></div>
          <nav aria-label="Your workspace" className="workspace-navigation" inert={navigationDisabled}>
            {destinations.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={navigationLink}>
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <NavLink to={HELP_PATH} state={{ fromWorkspace: true }} className={({ isActive }) => `${navigationLink({ isActive })} workspace-help`}>
            <CircleHelp aria-hidden="true" className="size-5 shrink-0" />
            <span>Help</span>
          </NavLink>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content @container outline-none">
          <div className="mx-auto w-full max-w-3xl pt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
