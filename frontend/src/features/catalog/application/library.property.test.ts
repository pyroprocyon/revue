import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sharedSetId } from './library';

const MAX_DATABASE_ID = 2n ** 63n - 1n;
const RUNS = { seed: 20261116, numRuns: 300 };

const shareCode = fc.bigInt({ min: 1n, max: MAX_DATABASE_ID }).map((id) => id.toString(36));
const characterOutsideBase36 = fc.constantFrom('A', 'Z', '/', '.', '-', '_', ' ', '%', 'é');

describe('shared set identifiers, for generated inputs', () => {
  it('turns every share code back into the database identifier it encodes', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: MAX_DATABASE_ID }), (id) => {
        expect(sharedSetId(id.toString(36))).toBe(id.toString());
      }),
      RUNS,
    );
  });

  it('rejects a code with a leading zero or a character outside base 36', () => {
    const withLeadingZero = shareCode.map((code) => `0${code}`);
    const withForeignCharacter = fc
      .tuple(shareCode, characterOutsideBase36, fc.nat())
      .map(([code, character, position]) => {
        const index = position % (code.length + 1);
        return code.slice(0, index) + character + code.slice(index);
      });
    fc.assert(
      fc.property(fc.oneof(fc.constant(''), withLeadingZero, withForeignCharacter), (code) => {
        expect(() => sharedSetId(code)).toThrow();
      }),
      RUNS,
    );
  });
});
