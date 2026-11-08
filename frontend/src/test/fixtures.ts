import type { DemoCard, DemoCards, PublicSet } from '../features/catalog/application/publicContent';

export const historySet: PublicSet = {
  setKey: 'philippine-history',
  title: 'Philippine History',
  description: 'Five moments from Mactan to Malolos.',
  publisherName: 'Revue',
  cardCount: 5,
  trialAvailable: true,
};

export const natureSet: PublicSet = {
  setKey: 'philippine-nature',
  title: 'Philippine Nature',
  description: 'From Mount Apo to the Sulu Sea.',
  publisherName: 'Revue',
  cardCount: 5,
  trialAvailable: true,
};

// All shared cards have sources. Card 1 has an optional note; card 3 links to its source.
const SOURCES: Record<number, string> = {
  1: 'Grade 6 book, page 45',
  3: 'Class handout: https://example.com/handout-3',
};

function demoCard(number: number): DemoCard {
  return {
    key: `card-${number}`,
    question: `Question ${number}?`,
    answer: `Answer ${number}.`,
    explanation: number === 1 ? 'Note 1.' : null,
    source: SOURCES[number] ?? `Class notes, page ${number}`,
  };
}

export const historyCards: DemoCards = {
  setTitle: 'Philippine History',
  publisherName: 'Revue',
  cards: [1, 2, 3, 4, 5].map(demoCard),
};
