import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetPage } from './pages/SetPage';
import { SetsPage } from './pages/SetsPage';
import { TrialPage } from './pages/TrialPage';
import { HOME_PATH, SETS_PATH, SET_ROUTE, TRIAL_ROUTE } from './paths';

/** Each page draws its own phone-height screen (components/Screen), so the routes are flat. */
export function App() {
  return (
    <>
      <ScrollToTopOnNewPage />
      <Routes>
        <Route path={HOME_PATH} element={<LandingPage />} />
        <Route path={SETS_PATH} element={<SetsPage />} />
        <Route path={SET_ROUTE} element={<SetPage />} />
        <Route path={TRIAL_ROUTE} element={<TrialPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
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
