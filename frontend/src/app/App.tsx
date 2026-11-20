import { UnsavedDeckChanges } from '../features/catalog/presentation/UnsavedDeckChanges';
import { PendingLoginReads } from './PendingLoginReads';
import { ReviewProvider } from '../features/study/presentation/ReviewProvider';
import { ReviewHeading } from '../features/study/presentation/ReviewHeading';
import { loadTodayOverview, TodayPage } from '../features/study/presentation/TodayPage';
import { httpReviews } from '../features/study/infrastructure/httpReviews';
import { LibraryProvider } from '../features/catalog/presentation/LibraryProvider';
import { LibraryBrowsingLayout } from '../features/catalog/presentation/LibraryBrowsingLayout';
import {
  LibraryRoute,
  preloadLibraryPage,
  preloadSavedSetBrowser,
} from '../features/catalog/presentation/LibraryRoute';
import { httpLibrary } from '../features/catalog/infrastructure/httpLibrary';
import { DeckProvider } from '../features/catalog/presentation/DeckProvider';
import { DeckPage, preloadDeckContent } from '../features/catalog/presentation/DeckPage';
import { httpDecks } from '../features/catalog/infrastructure/httpDecks';
import { httpAccount } from '../features/account/infrastructure/httpAccount';
import { AccountProvider } from '../features/account/presentation/AccountProvider';
import { AccountForm } from '../features/account/presentation/AccountForm';
import { AccountLayout } from '../features/account/presentation/AccountLayout';
import { JoinPage } from '../features/account/presentation/JoinPage';
import { TermsPage } from '../features/account/presentation/TermsPage';
import { PrivacyPage } from '../features/account/presentation/PrivacyPage';
import { httpPublicContent } from '../features/catalog/infrastructure/httpPublicContent';
import { PublicContentProvider } from '../features/catalog/presentation/PublicContentProvider';
import { Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GuestRoute, PublicSessionLayout } from './PublicSessionLayout';
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { HelpPage } from './pages/HelpPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import { shouldWaitForSession } from '../shared/navigation/signedInHint';
import { deferredPage } from '../shared/navigation/deferredPage';
import { LoadingPlaceholder, LoadingStatus } from '../shared/ui/LoadingFeedback';
import { WhenSlow } from '../shared/ui/WhenSlow';
import { WorkspacePage } from '../shared/ui/WorkspacePage';
import {
  TODAY_PATH,
  REVIEW_PATH,
  REVIEW_TOPIC_ROUTE,
  START_TOPIC_ROUTE,
  HELP_PATH,
  LIBRARY_PATH,
  PUBLISHED_PATH,
  NEW_DECK_PATH,
  DECK_ROUTE,
  PASTE_CARDS_ROUTE,
  HOME_PATH,
  HOW_IT_WORKS_PATH,
  SETS_PATH,
  SET_ROUTE,
  TRIAL_ROUTE,
  SIGN_IN_PATH,
  REGISTER_PATH,
  ACCOUNT_PATH,
  INVITE_PATH,
  SET_SHARE_ROUTE,
  JOIN_PATH,
  PRIVACY_PATH,
  TERMS_PATH,
  isPositiveLongId,
} from '../shared/navigation/paths';

const { Page: AccountPage, preload: loadAccountPage } = deferredPage(() =>
  import('../features/account/presentation/AccountPage').then(({ AccountPage }) => AccountPage),
);
const { Page: PublishedPage, preload: loadPublishedPage } = deferredPage(() =>
  import('../features/catalog/presentation/PublishedPage').then(({ PublishedPage }) => PublishedPage),
);
const { Page: NewDeckPage, preload: loadNewDeckPage } = deferredPage(() =>
  import('../features/catalog/presentation/NewDeckPage').then(({ NewDeckPage }) => NewDeckPage),
);
const { Page: ReviewPage, preload: loadReviewPage } = deferredPage(() =>
  import('../features/study/presentation/ReviewPage').then(({ ReviewPage }) => ReviewPage),
);
const { Page: PasteCardsPage, preload: loadPasteCardsPage } = deferredPage(() =>
  import('../features/catalog/presentation/PasteCardsPage').then(({ PasteCardsPage }) => PasteCardsPage),
);

const workspacePages = [
  [NEW_DECK_PATH, loadNewDeckPage],
  [PASTE_CARDS_ROUTE, loadPasteCardsPage],
  [TODAY_PATH, loadTodayOverview],
  [REVIEW_TOPIC_ROUTE, loadReviewPage],
  [START_TOPIC_ROUTE, loadReviewPage],
  [ACCOUNT_PATH, loadAccountPage],
  [PUBLISHED_PATH, loadPublishedPage],
] as const;

function preload(load: () => Promise<unknown>) {
  void load().catch(() => {
    // The route error boundary handles a failed download if the page opens.
  });
}

/** Downloads only the requested private page's code while the account boundary verifies the session. */
export function preloadWorkspacePage({ pathname, search }: Pick<Location, 'pathname' | 'search'>) {
  if (!shouldWaitForSession()) return;
  const page = workspacePages.find(([pattern]) => matchPath(pattern, pathname));
  if (page) preload(page[1]);
  if (matchPath(LIBRARY_PATH, pathname)) {
    const params = new URLSearchParams(search);
    if (params.get('shelf') === 'saved' && isPositiveLongId(params.get('set') ?? '')) {
      preload(preloadSavedSetBrowser);
    }
  }
}

/** Public journeys choose their layout; private routes share the confirmed account boundary. */
export function App() {
  return (
    <AccountProvider gateway={httpAccount}>
      <ReviewProvider gateway={httpReviews}>
        <LibraryProvider gateway={httpLibrary}>
          <DeckProvider gateway={httpDecks}>
            <PublicContentProvider reader={httpPublicContent}>
              <ScrollOnNavigation />
              <Routes>
                <Route element={<PublicSessionLayout />}>
                  <Route path={HOME_PATH} element={<LandingPage />} />
                  <Route path={HOW_IT_WORKS_PATH} element={<HowItWorksPage />} />
                  <Route path={HELP_PATH} element={<HelpPage />} />
                  <Route path={SETS_PATH} element={<SetsPage />} />
                  <Route path={SET_ROUTE} element={<SetPage />} />
                  <Route path={SET_SHARE_ROUTE} element={<SetPage />} />
                  <Route path={TRIAL_ROUTE} element={<TrialPage reader={httpPublicContent} />} />
                  <Route element={<GuestRoute />}>
                    <Route path={SIGN_IN_PATH} element={<AccountForm key="sign-in" />} />
                    <Route path={JOIN_PATH} element={<JoinPage />} />
                    <Route path={INVITE_PATH} element={<SignupPage />} />
                    <Route path={REGISTER_PATH} element={<SignupPage />} />
                  </Route>
                  <Route path={PRIVACY_PATH} element={<PrivacyPage />} />
                  <Route path={TERMS_PATH} element={<TermsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route element={<AccountLayout pendingReads={PendingLoginReads} />}>
                  <Route path={TODAY_PATH} element={<TodayPage />} />
                  <Route element={<LibraryBrowsingLayout />}>
                    <Route path={LIBRARY_PATH} element={<LibraryRoute />} />
                    <Route element={<UnsavedDeckChanges />}>
                      <Route
                        path={NEW_DECK_PATH}
                        element={
                          <DeferredWorkspacePage title="Create a deck">
                            <NewDeckPage />
                          </DeferredWorkspacePage>
                        }
                      />
                      <Route path={DECK_ROUTE} element={<DeckPage />} />
                      <Route
                        path={PASTE_CARDS_ROUTE}
                        element={
                          <DeferredWorkspacePage title="Paste cards">
                            <PasteCardsPage />
                          </DeferredWorkspacePage>
                        }
                      />
                    </Route>
                  </Route>
                  <Route
                    path={PUBLISHED_PATH}
                    element={
                      <DeferredWorkspacePage title="Reviewers">
                        <PublishedPage />
                      </DeferredWorkspacePage>
                    }
                  />
                  <Route
                    path={ACCOUNT_PATH}
                    element={
                      <DeferredWorkspacePage title="Your account" className="settings-page">
                        <AccountPage />
                      </DeferredWorkspacePage>
                    }
                  />
                </Route>
                <Route path={REVIEW_PATH} element={<Navigate to={TODAY_PATH} replace />} />
                <Route element={<AccountLayout focused loadingHeader={<ReviewHeading />} />}>
                  <Route path={REVIEW_TOPIC_ROUTE} element={<DeferredReview />} />
                  <Route path={START_TOPIC_ROUTE} element={<DeferredReview includeNew />} />
                </Route>
              </Routes>
              <PreloadCollectionPage />
            </PublicContentProvider>
          </DeckProvider>
        </LibraryProvider>
      </ReviewProvider>
    </AccountProvider>
  );
}

/** Run after the route mounts so account verification can start before requesting these bundles. */
function PreloadCollectionPage() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!shouldWaitForSession()) return;
    if (matchPath(LIBRARY_PATH, pathname)) preload(preloadLibraryPage);
    const deckId = matchPath(DECK_ROUTE, pathname)?.params.deckId;
    if (deckId && isPositiveLongId(deckId)) preload(preloadDeckContent);
  }, [pathname]);
  return null;
}

function DeferredReview({ includeNew }: Readonly<{ includeNew?: boolean }>) {
  const { reviewHeader } = useOutletContext<{ reviewHeader: HTMLElement | null }>();
  return (
    <Suspense
      fallback={
        <div className="review-flow pb-4 sm:pb-6">
          {reviewHeader ? createPortal(<ReviewHeading />, reviewHeader) : <ReviewHeading />}
          <WhenSlow>
            <LoadingPlaceholder kind="study">Loading your cards…</LoadingPlaceholder>
          </WhenSlow>
        </div>
      }
    >
      <ReviewPage includeNew={includeNew} />
    </Suspense>
  );
}

function DeferredWorkspacePage({
  title,
  className,
  children,
}: Readonly<{ title: string; className?: string; children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <WorkspacePage title={title} className={className} focusHeading={false}>
          <WhenSlow>
            <LoadingStatus>Loading this page…</LoadingStatus>
          </WhenSlow>
        </WorkspacePage>
      }
    >
      {children}
    </Suspense>
  );
}

function SignupPage() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (pathname !== REGISTER_PATH || hash) void navigate({ pathname: REGISTER_PATH, search }, { replace: true });
  }, [pathname, search, hash, navigate]);
  return <AccountForm register />;
}

/**
 * Opens each new page at the top, as a fresh screen should. Where the window itself scrolls
 * (desktop and short screens), the browser would otherwise keep the old page's position. Only a
 * change of page or section counts. Section targets are scrolled after React renders them.
 */
function ScrollOnNavigation() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => preloadWorkspacePage({ pathname, search }), [pathname, search]);
  useLayoutEffect(() => {
    if (hash !== '') {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash]);
  return null;
}
