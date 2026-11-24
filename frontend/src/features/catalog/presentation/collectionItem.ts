import { createElement, type ReactNode } from 'react';
import { CollectionIcon } from '../../../shared/ui/CollectionIcon';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import type { Deck } from '../application/decks';
import { deckPath } from '../../../shared/navigation/paths';
import type { RouteState } from '../../../shared/navigation/routeState';

export type CollectionItem = Pick<Deck, 'id' | 'title' | 'cardCount'> & { archived?: boolean; savedSetPath?: string };

export function collectionItemPath(item: CollectionItem) {
  return item.savedSetPath ?? deckPath(item.id);
}

export function collectionKind(item: CollectionItem) {
  if (item.archived) return 'paused';
  return item.savedSetPath ? 'saved' : 'personal';
}

export type CollectionLinkItem = {
  id: string;
  title: string;
  to: string;
  state?: RouteState;
  countLabel: string;
  icon: ReactNode;
  archived?: boolean;
  saved?: boolean;
  inLibrary?: boolean;
};

export function deckCollectionLink(deck: CollectionItem): CollectionLinkItem {
  return {
    id: deck.id,
    title: deck.title,
    to: collectionItemPath(deck),
    countLabel: cardCountLabel(deck.cardCount),
    icon: createElement(CollectionIcon, { kind: collectionKind(deck) }),
    archived: deck.archived,
    saved: Boolean(deck.savedSetPath),
  };
}
