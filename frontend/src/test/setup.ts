import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { bindWritesTo, forgetCsrfToken } from '../shared/http/sameOriginRequest';

// jsdom has no layout, so it doesn't implement scrolling; the app scrolls each new page to the top.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

// jsdom has no layout, so nothing it renders ever changes size.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  readonly scrollMargin = '0px';
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// jsdom has no native modal API. Browser tests cover its focus trap and Escape behavior.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
  this.querySelector('button')?.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

// Testing Library removes rendered components by itself only when Vitest's globals are on.
// They are off here (tests import describe, it and expect), so clean up after each test.
// Tests that replace fetch or browser APIs with vi.stubGlobal get the real ones back too.
// The signed-in hint lives in browser storage and the CSRF token and write binding in memory, so each test starts as a
// new visitor.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetCsrfToken();
  bindWritesTo(null);
});
