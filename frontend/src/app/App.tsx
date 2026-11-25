import { UnsavedDeckChanges } from '../features/catalog/presentation/UnsavedDeckChanges';
import { PendingLoginReads } from './PendingLoginReads';
import { ReviewProvider } from '../features/study/presentation/ReviewProvider';
import { TodayPage } from '../features/study/presentation/TodayPage';
import { ReviewPage } from '../features/study/presentation/ReviewPage';
import { httpReviews } from '../features/study/infrastructure/httpReviews';
import { LibraryProvider } from '../features/catalog/presentation/LibraryProvider';
import { LibraryPage } from '../features/catalog/presentation/LibraryPage';
import { LibraryBrowsingLayout } from '../features/catalog/presentation/LibraryBrowsingLayout';
import { httpLibrary } from '../features/catalog/infrastructure/httpLibrary';
import { DeckProvider } from '../features/catalog/presentation/DeckProvider';
import { DeckPage, preloadDeckContent } from '../features/catalog/presentation/DeckPage';
import { preloadSavedSetBrowser } from '../features/catalog/presentation/SavedSets';
import { NewDeckPage } from '../features/catalog/presentation/NewDeckPage';
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
import { lazy, Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { GuestRoute, PublicSessionLayout } from './PublicSessionLayout';
import { matchPath, Route, Routes, useLocation, useNavigate } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { HelpPage } from './pages/HelpPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import { shouldWaitForSession } from '../shared/navigation/signedInHint';
import { LoadingStatus } from '../shared/ui/LoadingFeedback';
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

const loadAccountPage = () => import('../features/account/presentation/AccountPage');
const loadPublishedPage = () => import('../features/catalog/presentation/PublishedPage');
const AccountPage = lazy(() => loadAccountPage().then(({ AccountPage }) => ({ default: AccountPage })));
const PublishedPage = lazy(() => loadPublishedPage().then(({ PublishedPage }) => ({ default: PublishedPage })));

/** Downloads only the requested private page's code while the account boundary verifies the session. */
export function preloadInitialWorkspacePage({ pathname, search }: Pick<Location, 'pathname' | 'search'>) {
  if (!shouldWaitForSession()) return;
  const deckId = matchPath(DECK_ROUTE, pathname)?.params.deckId;
  if (deckId && isPositiveLongId(deckId)) preloadDeckContent();
  else if (matchPath(LIBRARY_PATH, pathname)) {
    const params = new URLSearchParams(search);
    if (params.get('shelf') === 'saved' && isPositiveLongId(params.get('set') ?? '')) preloadSavedSetBrowser();
  } else if (matchPath(ACCOUNT_PATH, pathname)) {
    void loadAccountPage().catch(() => {
      // The account route reports a failed download when it opens.
    });
  } else if (matchPath(PUBLISHED_PATH, pathname)) {
    void loadPublishedPage().catch(() => {
      // The published route reports a failed download when it opens.
    });
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
                    <Route path={LIBRARY_PATH} element={<LibraryPage />} />
                    <Route element={<UnsavedDeckChanges />}>
                      <Route path={NEW_DECK_PATH} element={<NewDeckPage />} />
                      <Route path={DECK_ROUTE} element={<DeckPage />} />
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
                      <DeferredWorkspacePage title="Your account">
                        <AccountPage />
                      </DeferredWorkspacePage>
                    }
                  />
                </Route>
                <Route element={<AccountLayout focused />}>
                  <Route path={REVIEW_PATH} element={<ReviewPage />} />
                  <Route path={REVIEW_TOPIC_ROUTE} element={<ReviewPage />} />
                  <Route path={START_TOPIC_ROUTE} element={<ReviewPage includeNew />} />
                </Route>
              </Routes>
            </PublicContentProvider>
          </DeckProvider>
        </LibraryProvider>
      </ReviewProvider>
    </AccountProvider>
  );
}

function DeferredWorkspacePage({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <WorkspacePage title={title} focusHeading={false}>
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
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash !== '') {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash]);
  return null;
}
