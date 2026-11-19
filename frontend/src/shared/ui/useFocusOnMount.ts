import { useContext, useEffect, useRef } from 'react';
import { FocusRequestContext } from './FocusRequestContext';

/**
 * Moves keyboard and screen reader focus to an element when it first appears. Use it on a screen
 * that replaces the control that had focus, so focus doesn't fall back to the page. Spread the
 * returned props onto that element.
 */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  const requestFocus = useContext(FocusRequestContext);
  useEffect(() => {
    if (enabled) requestFocus(ref.current);
  }, [enabled, requestFocus]);
  return { ref, tabIndex: -1 } as const;
}
