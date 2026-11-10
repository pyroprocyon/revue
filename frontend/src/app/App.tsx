import { httpAccount } from '../features/account/infrastructure/httpAccount';
import { AccountProvider } from '../features/account/presentation/AccountProvider';
import { AccountForm } from '../features/account/presentation/AccountForm';
import { AccountPage } from '../features/account/presentation/AccountPage';
import { TermsPage } from '../features/account/presentation/TermsPage';
import { PrivacyPage } from '../features/account/presentation/PrivacyPage';
import { httpPublicContent } from '../features/catalog/infrastructure/httpPublicContent';
import { PublicContentProvider } from '../features/catalog/presentation/PublicContentProvider';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import { HOME_PATH, SETS_PATH, SET_ROUTE, TRIAL_ROUTE, SIGN_IN_PATH, REGISTER_PATH, ACCOUNT_PATH } from '../shared/navigation/paths';

/** Each page draws its own phone-height screen (components/Screen), so the routes are flat. */
export function App() {
  return (
    <AccountProvider gateway={httpAccount}>
    <PublicContentProvider reader={httpPublicContent}>
      <ScrollToTopOnNewPage />
      <Routes>
        <Route path={HOME_PATH} element={<LandingPage />} />
        <Route path={SETS_PATH} element={<SetsPage />} />
        <Route path={SET_ROUTE} element={<SetPage />} />
        <Route path={TRIAL_ROUTE} element={<TrialPage />} />
        <Route path={SIGN_IN_PATH} element={<AccountForm />} />
        <Route path={REGISTER_PATH} element={<AccountForm register />} />
        <Route path={ACCOUNT_PATH} element={<AccountPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PublicContentProvider>
    </AccountProvider>
  );
}

/**
 * Opens each new page at the top, as a fresh screen should. Where the window itself scrolls
 * (desktop and short screens), the browser would otherwise keep the old page's position. Only a
 * change of page counts, and a URL with a #section is left to scroll to that section.
 */
function ScrollToTopOnNewPage() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.location.hash === '') {
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}
