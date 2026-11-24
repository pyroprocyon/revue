import { useLayoutEffect, useState } from 'react';

const TWO_PANE_MIN_WIDTH_REM = 38;

/** Measured in rem, so enlarged text keeps the one-column phone layout on a tablet-sized screen. */
export function useTwoPanes() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    if (!element) return;
    const fits = (width: number) => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setWide(width >= TWO_PANE_MIN_WIDTH_REM * rem);
      setMeasured(true);
    };
    fits(element.getBoundingClientRect().width);
    const sizeChanges = new ResizeObserver(([entry]) => fits(entry.contentRect.width));
    sizeChanges.observe(element);
    return () => sizeChanges.disconnect();
  }, [element]);
  return [setElement, wide, measured] as const;
}
