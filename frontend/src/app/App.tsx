import { UnsavedDeckChanges } from '../features/catalog/presentation/UnsavedDeckChanges';
import { ReviewProvider } from '../features/study/presentation/ReviewProvider';
import { TodayPage } from '../features/study/presentation/TodayPage';
import { ReviewPage } from '../features/study/presentation/ReviewPage';
import { httpReviews } from '../features/study/infrastructure/httpReviews';
import { LibraryProvider } from '../features/catalog/presentation/LibraryProvider';
import { LibraryPage } from '../features/catalog/presentation/LibraryPage';
import { LibraryBrowsingLayout } from '../features/catalog/presentation/LibraryBrowsingLayout';
import { httpLibrary } from '../features/catalog/infrastructure/httpLibrary';
import { DeckProvider } from '../features/catalog/presentation/DeckProvider';
import { DeckPage } from '../features/catalog/presentation/DeckPage';
import { NewDeckPage } from '../features/catalog/presentation/NewDeckPage';
import { httpDecks } from '../features/catalog/infrastructure/httpDecks';
import { httpAccount } from '../features/account/infrastructure/httpAccount';
import { AccountProvider } from '../features/account/presentation/AccountProvider';
import { AccountForm } from '../features/account/presentation/AccountForm';
import { AccountPage } from '../features/account/presentation/AccountPage';
import { AccountLayout } from '../features/account/presentation/AccountLayout';
import { JoinPage } from '../features/account/presentation/JoinPage';
import { TermsPage } from '../features/account/presentation/TermsPage';
import { PrivacyPage } from '../features/account/presentation/PrivacyPage';
import { httpPublicContent } from '../features/catalog/infrastructure/httpPublicContent';
import { PublicContentProvider } from '../features/catalog/presentation/PublicContentProvider';
import { useEffect } from 'react';
import { GuestRoute, PublicSessionLayout } from './PublicSessionLayout';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { HelpPage } from './pages/HelpPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import {
  TODAY_PATH,
  REVIEW_PATH,
  REVIEW_TOPIC_ROUTE,
  START_TOPIC_ROUTE,
  HELP_PATH,
  LIBRARY_PATH,
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
} from '../shared/navigation/paths';

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
                <Route element={<AccountLayout />}>
                  <Route path={TODAY_PATH} element={<TodayPage />} />
                  <Route element={<LibraryBrowsingLayout />}>
                    <Route path={LIBRARY_PATH} element={<LibraryPage />} />
                    <Route element={<UnsavedDeckChanges />}>
                      <Route path={NEW_DECK_PATH} element={<NewDeckPage />} />
                      <Route path={DECK_ROUTE} element={<DeckPage />} />
                    </Route>
                  </Route>
                  <Route path={ACCOUNT_PATH} element={<AccountPage />} />
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
  useEffect(() => {
    if (hash !== '') {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}
