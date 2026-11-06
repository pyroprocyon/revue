import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library removes rendered components by itself only when Vitest's globals are on.
// They are off here (tests import describe, it and expect), so clean up after each test.
afterEach(() => {
  cleanup();
});
