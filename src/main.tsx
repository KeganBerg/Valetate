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
  // a new version took over (it installs itself in the background): reload once so an
  // app left open on a phone shows it instead of the old screens
  const hadWorker = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // look for a new version whenever the app comes back to the front
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // private browsing or blocked: the app still works online
      });
  });
}
