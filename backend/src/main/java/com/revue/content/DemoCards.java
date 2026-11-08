package com.revue.content;

import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * The five trial cards. The trial runs in the browser and shows each answer only after the visitor
 * flips the card.
 */
record DemoCards(String setTitle, String publisherName, List<DemoCard> cards) {

	DemoCards {
		cards = List.copyOf(cards);
	}

	static DemoCards from(SharedSet set, List<Card> cards) {
		List<DemoCard> demoCards = cards.stream().map(DemoCard::from).toList();
		return new DemoCards(set.title(), set.publisherName(), demoCards);
	}

	/** One flashcard: the question on the front, the answer and its optional note and source on the back. */
	record DemoCard(String key, String question, String answer, @Nullable String explanation,
			@Nullable String source) {

		static DemoCard from(Card card) {
			return new DemoCard(card.contentKey(), card.question(), card.answer(), card.explanation(), card.source());
		}

	}

}
