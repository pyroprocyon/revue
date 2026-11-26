import type { CardDraft, DeckCard } from '../application/decks';

export function draftOf(card?: DeckCard): CardDraft {
  return {
    question: card?.question ?? '',
    answer: card?.answer ?? '',
    explanation: card?.explanation ?? '',
    memoryHook: card?.memoryHook ?? '',
    source: card?.source ?? '',
  };
}

export function draftChanged(draft: CardDraft, original: CardDraft) {
  return (Object.keys(draft) as (keyof CardDraft)[]).some((key) => draft[key] !== original[key]);
}
