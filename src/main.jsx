import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const optionalProfilerModule = 'react-scan';
  import(/* @vite-ignore */ optionalProfilerModule)
    .then(({ scan }) => {
      scan({
        enabled: true,
      });
    })
    .catch(() => {
      // Optional local profiling dependency; skip silently when unavailable.
    });
}
import './styles.css';

function detectDisplayMode() {
  if (typeof window === 'undefined') return 'browser';
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.navigator?.standalone) return 'standalone';
  return 'browser';
}

function detectAppleMobilePlatform() {
  if (typeof window === 'undefined') {
    return { isIOS: false, isIPhone: false };
  }

  const nav = window.navigator;
  const userAgent = nav?.userAgent || '';
  const platform = nav?.platform || '';
  const maxTouchPoints = nav?.maxTouchPoints || 0;
  const isIPhone = /iphone|ipod/i.test(userAgent);
  const isIPad = /ipad/i.test(userAgent) || (/mac/i.test(platform) && maxTouchPoints > 1);

  return {
    isIOS: isIPhone || isIPad,
    isIPhone,
  };
}

function applyAppEnvironment() {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const body = document.body;

  const sync = () => {
    const displayMode = detectDisplayMode();
    const vv = window.visualViewport;
    const viewportHeight = vv?.height || window.innerHeight || 0;
    const viewportWidth = vv?.width || window.innerWidth || 0;
    const offsetTop = vv?.offsetTop || 0;
    const shortestEdge = Math.round(Math.min(viewportWidth, viewportHeight));
    const longestEdge = Math.round(Math.max(viewportWidth, viewportHeight));
    const keyboardInset = Math.max(
      0,
      (window.innerHeight || viewportHeight) - viewportHeight - offsetTop,
    );
    const layoutHeight = Math.max(
      window.innerHeight || 0,
      viewportHeight + offsetTop,
      document.documentElement?.clientHeight || 0,
    );
    const { isIOS, isIPhone } = detectAppleMobilePlatform();

    root.style.setProperty('--app-height', `${layoutHeight}px`);
    root.style.setProperty('--visual-height', `${viewportHeight}px`);
    root.style.setProperty('--visual-width', `${viewportWidth}px`);
    root.style.setProperty('--viewport-offset-top', `${offsetTop}px`);
    root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);

    body.dataset.displayMode = displayMode;
    body.classList.toggle(
      'is-standalone',
      displayMode === 'standalone' || displayMode === 'fullscreen',
    );
    body.classList.toggle('is-browser', displayMode === 'browser');
    body.classList.toggle('keyboard-open', keyboardInset > 24);
    body.classList.toggle('is-ios', isIOS);
    body.classList.toggle('is-ios-handset', isIPhone);
    body.classList.toggle('is-iphone-compact', isIPhone && shortestEdge <= 390);
    body.classList.toggle('is-iphone-short', isIPhone && longestEdge <= 740);
    body.classList.toggle('is-iphone-tall', isIPhone && longestEdge >= 844);
  };

  sync();

  const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
  const fullscreenQuery = window.matchMedia?.('(display-mode: fullscreen)');

  window.addEventListener('resize', sync, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });
  window.visualViewport?.addEventListener('resize', sync, { passive: true });
  window.visualViewport?.addEventListener('scroll', sync, { passive: true });
  standaloneQuery?.addEventListener?.('change', sync);
  fullscreenQuery?.addEventListener?.('change', sync);
}

applyAppEnvironment();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
