import type { ReactElement } from 'react';
import HomePage from '../features/home/HomePage.tsx';
import EncodePage from '../features/encode/EncodePage.tsx';
import DecodePage from '../features/decode/DecodePage.tsx';
import HistoryPage from '../features/history/HistoryPage.tsx';
import SettingsPage from '../features/settings/SettingsPage.tsx';

export interface AppRoute {
  path: string;
  label: string;
  nav: boolean;
  element: ReactElement;
}

export const routes: AppRoute[] = [
  { path: '/', label: 'Home', nav: false, element: <HomePage /> },
  { path: '/encode', label: 'Encode', nav: true, element: <EncodePage /> },
  { path: '/decode', label: 'Decode', nav: true, element: <DecodePage /> },
  { path: '/history', label: 'History', nav: true, element: <HistoryPage /> },
  { path: '/settings', label: 'Settings', nav: true, element: <SettingsPage /> },
];
