import type { Deck } from '../application/decks';
import { deckPath } from '../../../shared/navigation/paths';

export type CollectionItem = Pick<Deck, 'id' | 'title' | 'cardCount'> & { archived?: boolean; savedSetPath?: string };

export function collectionItemPath(item: CollectionItem) {
  return item.savedSetPath ?? deckPath(item.id);
}

export function collectionKind(item: CollectionItem) {
  if (item.archived) return 'paused';
  return item.savedSetPath ? 'saved' : 'personal';
}
