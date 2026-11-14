import { describe, expect, it } from 'vitest';
import { safeAccountReturnPath } from './account';

describe('account return destination', () => {
  it('permits only a local set preview or supported workspace destination', () => {
    expect(safeAccountReturnPath('/library')).toBe('/library');
    for (const path of ['/today', '/review', '/account']) expect(safeAccountReturnPath(path)).toBe(path);
    expect(safeAccountReturnPath('/library?user=other')).toBeNull();
    expect(safeAccountReturnPath('/sets/human-body')).toBe('/sets/human-body');
    for (const path of [null, '//example.com', 'https://example.com', '/sets/../account', '/sets/a?secret=x', '/sets/a#secret', '/sets/']) {
      expect(safeAccountReturnPath(path)).toBeNull();
    }
  });
});
