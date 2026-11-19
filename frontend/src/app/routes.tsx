import type { RouteObject } from 'react-router';
import { RouteErrorPage } from '../shared/ui/RouteError';
import { App } from './App';

export const appRoutes: RouteObject[] = [{ path: '*', element: <App />, errorElement: <RouteErrorPage /> }];
