import { ReviewProvider } from '../features/study/presentation/ReviewProvider';
import { TodayPage } from '../features/study/presentation/TodayPage';
import { ReviewPage } from '../features/study/presentation/ReviewPage';
import { httpReviews } from '../features/study/infrastructure/httpReviews';
import { LibraryProvider } from '../features/catalog/presentation/LibraryProvider';
import { LibraryPage } from '../features/catalog/presentation/LibraryPage';
import { httpLibrary } from '../features/catalog/infrastructure/httpLibrary';
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
import { Route, Routes, useLocation } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { HelpPage } from './pages/HelpPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import { TODAY_PATH, REVIEW_PATH, HELP_PATH, LIBRARY_PATH, HOME_PATH, HOW_IT_WORKS_PATH, SETS_PATH, SET_ROUTE, TRIAL_ROUTE, SIGN_IN_PATH, REGISTER_PATH, ACCOUNT_PATH, INVITE_PATH, SET_SHARE_ROUTE, JOIN_PATH } from '../shared/navigation/paths';

/** Public journeys choose their layout; private routes share the confirmed account boundary. */
export function App() {
  return (
    <AccountProvider gateway={httpAccount}>
    <ReviewProvider gateway={httpReviews}>
    <LibraryProvider gateway={httpLibrary}>
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
            <Route path={INVITE_PATH} element={<AccountForm key="signup" register />} />
            <Route path={REGISTER_PATH} element={<AccountForm key="signup" register />} />
          </Route>
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route element={<AccountLayout />}>
          <Route path={TODAY_PATH} element={<TodayPage />} />
          <Route path={LIBRARY_PATH} element={<LibraryPage />} />
          <Route path={ACCOUNT_PATH} element={<AccountPage />} />
        </Route>
        <Route element={<AccountLayout focused />}><Route path={REVIEW_PATH} element={<ReviewPage />} /></Route>
      </Routes>
    </PublicContentProvider>
    </LibraryProvider>
    </ReviewProvider>
    </AccountProvider>
  );
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
