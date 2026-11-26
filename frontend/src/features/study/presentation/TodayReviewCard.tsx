import { useId, type ReactNode, type Ref } from 'react';
import { ArrowRight, Clock3, Play } from 'lucide-react';
import { Link } from 'react-router';
import { blueAccentButton, primaryButton } from '../../../shared/ui/buttonStyles';

type Props = {
  kind: 'continue' | 'next';
  title?: string | null;
  detail: string;
  to: string;
  action: string;
  linkRef?: Ref<HTMLAnchorElement>;
  children?: ReactNode;
};

export function TodayReviewCard({ kind, title, detail, to, action, linkRef, children }: Readonly<Props>) {
  const headingId = useId();
  const topicId = useId();
  const continuing = kind === 'continue';
  const Icon = continuing ? Play : Clock3;
  const iconColor = continuing ? 'bg-accent-soft text-accent' : 'bg-saved-set-soft text-saved-set';
  const button = continuing ? primaryButton : blueAccentButton;

  return (
    <section
      aria-labelledby={headingId}
      className="@container rounded-card border border-line bg-surface p-3 shadow-control sm:p-4"
    >
      <div className="grid min-w-0 gap-3 @min-[34rem]:grid-cols-[minmax(0,1fr)_14rem] @min-[34rem]:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`collection-icon ${iconColor}`}>
            <Icon aria-hidden="true" className="size-[1.125rem]" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h2 id={headingId} className="text-support font-semibold text-muted">
              {continuing ? 'Continue review' : 'Up next'}
            </h2>
            <div id={topicId} className="grid min-w-0 gap-0.5">
              <h3 className="text-section leading-tight font-bold tracking-tight wrap-anywhere">{title}</h3>
              <p className="text-support text-muted">{detail}</p>
            </div>
          </div>
        </div>
        <Link to={to} ref={linkRef} aria-describedby={topicId} className={`${button} w-full @min-[34rem]:px-4`}>
          <span className="min-w-0 wrap-anywhere">{action}</span>
          <ArrowRight aria-hidden="true" className="hidden size-5 shrink-0 @min-[12rem]:block" />
        </Link>
      </div>
      {children}
    </section>
  );
}
