import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Default / max layout width for the fanned stack (must match `.statement-stack-scaler` in styles). */
const STAGE_WIDTH_REM = 41;
/** Do not shrink the stage below this (keeps cards from reflowing narrower than the fan layout). */
const MIN_STAGE_WIDTH_REM = 39;
/** Visual height budget after scale (stage min-height + small lift/shadow slack). */
const STAGE_HEIGHT_REM = 42;
const VIEWPORT_PAD_PX = 8;
/** Extra px around measured card bbox so shadows / rotation / selected scale do not clip. */
const BBOX_PAD_PX = 28;

export { STAGE_HEIGHT_REM };

/**
 * Manages the ResizeObserver-driven fit-to-width scaling of the fanned action card stack.
 *
 * @param {number} activeIndex - Currently selected card index (re-measures on change).
 * @returns {{ viewportRef, scalerRef, stageRef, scale, fitWidthPx }}
 */
export default function useStatementFan(activeIndex) {
  const viewportRef = useRef(null);
  const scalerRef = useRef(null);
  const stageRef = useRef(null);
  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const [fitWidthPx, setFitWidthPx] = useState(null);
  const [revealPhase, setRevealPhase] = useState('pre');

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || revealPhase !== 'pre') return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setRevealPhase('animating');
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;

        if (entry.isIntersecting || entry.intersectionRatio >= 0.34) {
          setRevealPhase('animating');
          io.disconnect();
        }
      },
      {
        threshold: [0.18, 0.34, 0.52],
        rootMargin: '0px 0px -10% 0px',
      },
    );

    io.observe(vp);
    return () => io.disconnect();
  }, [revealPhase]);

  useEffect(() => {
    if (revealPhase !== 'animating') return undefined;

    const timeoutId = window.setTimeout(() => {
      setRevealPhase('settled');
    }, 1280);

    return () => window.clearTimeout(timeoutId);
  }, [revealPhase]);

  useLayoutEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return undefined;

    const readInlineWidth = (entry) =>
      entry.contentBoxSize && entry.contentBoxSize[0]
        ? entry.contentBoxSize[0].inlineSize
        : entry.contentRect.width;

    const measureFitWidthPx = () => {
      const scaler = scalerRef.current;
      const stage = stageRef.current;
      const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const maxWpx = STAGE_WIDTH_REM * rootFs;
      const minWpx = MIN_STAGE_WIDTH_REM * rootFs;
      if (!scaler || !stage) return maxWpx;

      const k = Math.max(scaleRef.current, 0.001);
      const sRect = scaler.getBoundingClientRect();
      const slots = stage.querySelectorAll('.statement-stack-slot');
      let minL = Infinity;
      let maxR = -Infinity;
      for (const slot of slots) {
        const r = slot.getBoundingClientRect();
        minL = Math.min(minL, (r.left - sRect.left) / k);
        maxR = Math.max(maxR, (r.right - sRect.left) / k);
      }
      if (!Number.isFinite(minL) || !Number.isFinite(maxR) || maxR <= minL) return maxWpx;

      const spanPx = Math.ceil(maxR - minL + BBOX_PAD_PX);
      return Math.min(Math.max(spanPx, minWpx), maxWpx);
    };

    const apply = (inlineWidth) => {
      const avail = Math.max(0, inlineWidth - VIEWPORT_PAD_PX);
      const fitW = measureFitWidthPx();
      const nextScale = Math.min(1, avail / fitW);

      setFitWidthPx((prev) => (prev === fitW ? prev : fitW));
      setScale((prev) => (Math.abs(prev - nextScale) > 0.003 ? nextScale : prev));
    };

    const ro = new ResizeObserver((entries) => {
      apply(readInlineWidth(entries[0]));
    });
    ro.observe(vp);
    apply(vp.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [activeIndex, revealPhase]);

  return {
    viewportRef,
    scalerRef,
    stageRef,
    scale,
    fitWidthPx,
    isRevealed: revealPhase !== 'pre',
    isRevealAnimating: revealPhase === 'animating',
  };
}
