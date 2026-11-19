import { CircleAlert, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import { HOME_PATH, TODAY_PATH } from '../navigation/paths';
import { reloadPage } from '../navigation/pageLoads';
import { primaryButton, secondaryButton } from './buttonStyles';
import { HomeLink } from './HeaderLinks';
import { PageLayout } from './PageLayout';
import { useFocusOnMount } from './useFocusOnMount';

type BoundaryProps = { resetKey: string; fallback: ReactNode; children: ReactNode };
type BoundaryState = { failed: boolean; resetKey: string };

export class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RouteErrorCard({ signedIn }: Readonly<{ signedIn: boolean }>) {
  const headingFocus = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section className="mx-auto mt-8 max-w-[30rem] rounded-card bg-surface px-compact-gutter py-7 text-center shadow-card sm:px-10 sm:py-9 lg:mt-16">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-control bg-highlight-soft text-highlight-strong">
        <CircleAlert aria-hidden="true" className="size-6" />
      </span>
      <h1 {...headingFocus} className="text-section font-extrabold tracking-tight text-balance outline-none">
        Something went wrong
      </h1>
      <p className="mt-2 text-body text-muted">
        {signedIn ? 'This page stopped working. Cards and progress you saved are safe.' : 'This page stopped working.'}
      </p>
      <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
        <button type="button" className={primaryButton} onClick={reloadPage}>
          <RefreshCw aria-hidden="true" className="size-5 shrink-0" />
          Try again
        </button>
        <Link to={signedIn ? TODAY_PATH : HOME_PATH} className={`${secondaryButton} border border-line shadow-none`}>
          {signedIn ? 'Go to Today' : 'Go to the home page'}
        </Link>
      </div>
    </section>
  );
}

export function RouteErrorPage({ signedIn = false }: Readonly<{ signedIn?: boolean }>) {
  return (
    <PageLayout top={<HomeLink />}>
      <RouteErrorCard signedIn={signedIn} />
    </PageLayout>
  );
}
