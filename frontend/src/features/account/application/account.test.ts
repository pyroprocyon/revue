import { describe, expect, it } from 'vitest';
import { safeAccountReturnPath } from './account';

describe('account return destination', () => {
  it('permits a local public set preview only', () => {
    expect(safeAccountReturnPath('/sets/human-body')).toBe('/sets/human-body');
    for (const path of [null, '//example.com', 'https://example.com', '/account', '/sets/../account', '/sets/a?secret=x', '/sets/a#secret', '/sets/']) {
      expect(safeAccountReturnPath(path)).toBeNull();
    }
  });
});
