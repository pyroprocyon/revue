export type SavedSet = {
  id: string;
  setKey: string;
  title: string;
  description: string;
  publisherName: string;
  cardCount: number;
  retired: boolean;
  saveAllowed: boolean;
  savedAt: string;
};
export type LibraryPage = { items: SavedSet[]; nextCursor: string | null };
export type LibraryFailureReason = 'signed-out' | 'unavailable' | 'expired-form' | 'unknown' | 'load';

export class LibraryFailure extends Error {
  constructor(public readonly reason: LibraryFailureReason) { super(reason); }
}

/** Only confirmed server state belongs in the saved library. null membership means signed out. */
export interface LibraryGateway {
  membership(id: string): Promise<boolean | null>;
  save(id: string): Promise<SavedSet>;
  remove(id: string): Promise<void>;
  list(after?: string): Promise<LibraryPage>;
}

/** Share identifiers are base 36; BigInt preserves the database's full bigint identifier. */
export function sharedSetId(code: string): string {
  if (!/^[1-9a-z][0-9a-z]*$/.test(code)) throw new Error('Invalid shared set identifier');
  return [...code].reduce((value, digit) => value * 36n + BigInt(Number.parseInt(digit, 36)), 0n).toString();
}
