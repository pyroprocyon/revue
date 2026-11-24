import { CircleHelp } from 'lucide-react';
import { NavLink } from 'react-router';
import { HELP_PATH } from '../navigation/paths';
import { OPENED_FROM_WORKSPACE } from '../navigation/routeState';
import { BrandMark } from './BrandMark';

export function WorkspaceHelpLink({ inTitle = false }: Readonly<{ inTitle?: boolean }>) {
  const placement = inTitle
    ? 'w-12 shrink-0 justify-center @min-[64rem]/workspace:hidden'
    : 'workspace-help aria-[current=page]:bg-accent-soft';
  return (
    <NavLink
      to={HELP_PATH}
      state={OPENED_FROM_WORKSPACE}
      aria-label="Help"
      title="Help"
      className={`pressable header-link ${placement}`}
    >
      <span className="hidden @max-[40rem]/workspace:block">
        <BrandMark />
      </span>
      <CircleHelp aria-hidden="true" className="@max-[40rem]/workspace:hidden" />
      {!inTitle && <span className="@max-[40rem]/workspace:hidden">Help</span>}
    </NavLink>
  );
}
