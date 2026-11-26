import { vi } from 'vitest';

/** jsdom has no layout, so every measured element reports 1,000 pixels, wide enough for two panes. */
export function wideLayout() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly report: ResizeObserverCallback;
      constructor(report: ResizeObserverCallback) {
        this.report = report;
      }
      observe(target: Element) {
        this.report([{ target, contentRect: { width: 1000 } } as unknown as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    },
  );
}
