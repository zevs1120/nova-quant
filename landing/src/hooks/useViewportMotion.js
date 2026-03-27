import { useEffect, useRef, useState } from 'react';

/**
 * One-shot or repeatable viewport reveal state.
 *
 * @param {{ threshold?: number, once?: boolean, rootMargin?: string }} [options]
 * @returns {{ ref: import('react').MutableRefObject<HTMLElement | null>, isVisible: boolean }}
 */
export function useViewportReveal(options = {}) {
  const { threshold = 0.16, once = true, rootMargin = '0px 0px -4% 0px' } = options;
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;

        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, isVisible };
}

/**
 * Tracks a motion-related media query.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function useMotionPreference(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const sync = () => setMatches(mediaQuery.matches);
    sync();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', sync);
      return () => mediaQuery.removeEventListener('change', sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, [query]);

  return matches;
}

/**
 * Lightweight scroll progress for section-driven transforms.
 *
 * @param {import('react').MutableRefObject<HTMLElement | null>} ref
 * @param {{ disabled?: boolean }} [options]
 * @returns {number}
 */
export function useScrollProgress(ref, options = {}) {
  const { disabled = false } = options;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (disabled) {
      setProgress(0);
      return undefined;
    }

    const node = ref.current;
    if (!node || typeof window === 'undefined') return undefined;

    let rafId = 0;

    const update = () => {
      rafId = 0;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
      const nextProgress = Math.min(
        1,
        Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height)),
      );

      setProgress((prev) => (Math.abs(prev - nextProgress) > 0.012 ? nextProgress : prev));
    };

    const queueUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
    };
    // `ref` is a stable useRef object — included for lint completeness, won't trigger re-runs.
  }, [disabled, ref]);

  return progress;
}
