import { describe, expect, it } from 'vitest';
import { safeAccountReturnPath } from './account';

describe('account return destination', () => {
  it('permits only a local set preview or supported workspace destination', () => {
    expect(safeAccountReturnPath('/library')).toBe('/library');
    for (const path of ['/today', '/review', '/account']) expect(safeAccountReturnPath(path)).toBe(path);
    expect(safeAccountReturnPath('/library?user=other')).toBeNull();
    expect(safeAccountReturnPath('/sets/human-body')).toBe('/sets/human-body');
    for (const path of [
      null,
      '//example.com',
      'https://example.com',
      '/sets/../account',
      '/sets/a?secret=x',
      '/sets/a#secret',
      '/sets/',
    ]) {
      expect(safeAccountReturnPath(path)).toBeNull();
    }
  });

  it('returns to deck creation, a private deck or its paste page without permitting arbitrary URL suffixes', () => {
    for (const path of [
      '/library/decks/new',
      '/library/decks/1',
      '/library/decks/9223372036854775807',
      '/library/decks/7/paste',
    ]) {
      expect(safeAccountReturnPath(path)).toBe(path);
    }
    for (const suffix of [
      '',
      '0',
      '-1',
      '1/../../account',
      '1?user=other',
      '1#secret',
      'new/other',
      'new/paste',
      '1/paste/other',
      '1/paste?text=private',
      '1%2Fother',
      '1'.repeat(130),
    ]) {
      expect(safeAccountReturnPath(`/library/decks/${suffix}`)).toBeNull();
    }
  });

  it('returns to the selected review topic or its explicit start route', () => {
    for (const path of ['/review/deck-1', '/review/set-9/start']) expect(safeAccountReturnPath(path)).toBe(path);
    for (const path of [
      '/review/set-0',
      '/review/deck-1/other',
      '/review/set-1/start/other',
      '/review/deck-1?next=2',
    ]) {
      expect(safeAccountReturnPath(path)).toBeNull();
    }
  });
});
