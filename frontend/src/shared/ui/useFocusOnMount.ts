import { useContext, useEffect, useRef } from 'react';
import { FocusRequestContext } from './FocusRequestContext';

/**
 * Moves keyboard and screen reader focus to the returned element when it first appears. Use it on
 * a screen that replaces the control that had focus, so focus doesn't fall back to the page.
 * The element needs tabIndex={-1} to accept focus.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const requestFocus = useContext(FocusRequestContext);
  useEffect(() => {
    requestFocus(ref.current);
  }, [requestFocus]);
  return ref;
}
