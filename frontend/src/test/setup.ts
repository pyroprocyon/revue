import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no layout, so it doesn't implement scrolling; the app scrolls each new page to the top.
window.scrollTo = () => {};

// Testing Library removes rendered components by itself only when Vitest's globals are on.
// They are off here (tests import describe, it and expect), so clean up after each test.
// Tests that replace fetch or browser APIs with vi.stubGlobal get the real ones back too.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
