import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react';

export const CollectionStackContext = createContext(false);

export function useCollectionLayoutVisible(container: RefObject<HTMLElement | null>) {
  const stack = useContext(CollectionStackContext);
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setVisible(element.getClientRects().length > 0);
    measure();
    const observer = new ResizeObserver(([entry]) => setVisible(entry.contentRect.width > 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, stack]);
  return visible;
}
