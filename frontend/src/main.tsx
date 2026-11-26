import '@fontsource-variable/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { preloadWorkspacePage } from './app/App';
import { appRoutes } from './app/routes';
import { watchPhoneInstall } from './features/account/presentation/homeScreenInstall';
import { watchTouchFocus } from './app/touchFocus';
import { watchSolidControls } from './shared/ui/solidControls';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('index.html has no #root element');
}

document.documentElement.toggleAttribute('data-android-phone', /Android.*Mobile/i.test(navigator.userAgent));
watchSolidControls();
watchPhoneInstall();
watchTouchFocus();
preloadWorkspacePage(window.location);
const queryClient = new QueryClient();
const router = createBrowserRouter(appRoutes);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
