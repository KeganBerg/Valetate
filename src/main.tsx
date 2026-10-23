import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import './styles.css';

// a guest's link (?car=…) gets only the small request page, not the whole app
const guestToken = new URLSearchParams(location.search).get('car');
const GuestPage = lazy(() => import('./GuestPage'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {guestToken ? (
      <Suspense fallback={null}>
        <GuestPage token={guestToken} />
      </Suspense>
    ) : (
      <Root />
    )}
  </StrictMode>,
);
