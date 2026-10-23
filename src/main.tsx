import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Loading } from './components/Loading';

// a guest's link (?car=…) gets only the small request page, not the whole app
const guestToken = new URLSearchParams(location.search).get('car');
const GuestPage = lazy(() => import('./GuestPage'));
const Root = lazy(() => import('./Root'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {guestToken ? (
      <Suspense fallback={<Loading />}>
        <GuestPage token={guestToken} />
      </Suspense>
    ) : (
      <Suspense fallback={<Loading />}>
        <Root />
      </Suspense>
    )}
  </StrictMode>,
);

// keep the app on the phone so it opens with no signal (built app only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // private browsing or blocked: the app still works online
    });
  });
}
