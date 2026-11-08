import { httpPublicContent } from '../features/catalog/infrastructure/httpPublicContent';
import { PublicContentProvider } from '../features/catalog/presentation/PublicContentProvider';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from '../features/catalog/presentation/SetPage';
import { SetsPage } from '../features/catalog/presentation/SetsPage';
import { TrialPage } from '../features/study/presentation/TrialPage';
import { HOME_PATH, SETS_PATH, SET_ROUTE, TRIAL_ROUTE } from '../shared/navigation/paths';

/** Each page draws its own phone-height screen (components/Screen), so the routes are flat. */
export function App() {
  return (
    <PublicContentProvider reader={httpPublicContent}>
      <ScrollToTopOnNewPage />
      <Routes>
        <Route path={HOME_PATH} element={<LandingPage />} />
        <Route path={SETS_PATH} element={<SetsPage />} />
        <Route path={SET_ROUTE} element={<SetPage />} />
        <Route path={TRIAL_ROUTE} element={<TrialPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PublicContentProvider>
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
