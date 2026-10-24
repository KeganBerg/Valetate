import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Loading } from './components/Loading';

const Root = lazy(() => import('./Root'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<Loading />}>
      <Root />
    </Suspense>
  </StrictMode>,
);

// keep the app on the device so maps open with no signal (built app only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // private browsing or blocked: the app still works online
    });
  });
}
