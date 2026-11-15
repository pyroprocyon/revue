import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { safeAccountReturnPath } from './account';

const RUNS = { seed: 20261116, numRuns: 300 };

const setKey = fc
  .array(fc.stringMatching(/^[a-z0-9]{1,8}$/), { minLength: 1, maxLength: 6 })
  .map((words) => words.join('-'));
const characterOutsideSetKeys = fc.constantFrom('/', '.', '%', '?', '#', '\\', ':', ' ', 'A', '_');

describe('account return paths, for generated inputs', () => {
  it('keeps every set preview path whose key is lowercase words joined by hyphens', () => {
    fc.assert(
      fc.property(setKey, (key) => {
        const path = `/sets/${key}`;
        expect(safeAccountReturnPath(path)).toBe(path);
      }),
      RUNS,
    );
  });

  it('rejects a set preview path once any other character enters its key', () => {
    fc.assert(
      fc.property(setKey, characterOutsideSetKeys, fc.nat(), (key, character, position) => {
        const index = position % (key.length + 1);
        const path = `/sets/${key.slice(0, index)}${character}${key.slice(index)}`;
        expect(safeAccountReturnPath(path)).toBeNull();
      }),
      RUNS,
    );
  });

  it('rejects a key with an empty word', () => {
    fc.assert(
      fc.property(setKey, fc.constantFrom('-', '--'), fc.boolean(), (key, hyphens, atStart) => {
        const broken = atStart ? `${hyphens}${key}` : `${key}${hyphens}`;
        expect(safeAccountReturnPath(`/sets/${broken}`)).toBeNull();
      }),
      RUNS,
    );
  });
});
