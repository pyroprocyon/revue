import type { ReactNode, Ref } from 'react';

type PasteDockProps = {
  ref?: Ref<HTMLDivElement>;
  problem?: ReactNode;
  children: ReactNode;
};

export function PasteDock({ ref, problem, children }: Readonly<PasteDockProps>) {
  return (
    <div ref={ref} className="paste-dock">
      {problem}
      <div className="paste-dock-glass">{children}</div>
    </div>
  );
}
