package com.revue.content.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublishedSetTests {
	private static final Instant NOW = Instant.parse("2026-11-08T12:00:00Z");

	@Test
	void correctionsAndRetirementStayInsideTheAggregate() {
		var original = card("one", "Original question?");
		var second = card("two", "Second question?");
		var set = PublishedSet.publish(definition(original, second));
		var correction = card("two", "Corrected question?");

		var changes = set.synchronize(definition(correction), NOW);

		assertThat(changes.cardsChanged()).isOne();
		assertThat(changes.cardsRetired()).isOne();
		assertThat(set.cards().get(0).retiredAt()).isEqualTo(NOW);
		assertThat(set.cards().get(1).contentVersion()).isEqualTo(2);
		assertThat(set.cards().get(1).position()).isZero();
		assertThat(set.synchronize(definition(correction), NOW).cardsChanged()).isZero();
		assertThat(set.cards().get(1).contentVersion()).isEqualTo(2);
	}

	@Test
	void retirementKeepsActiveCardsAndRestoringAKeyKeepsItsVersion() {
		var card = card("one", "Question?");
		var definition = definition(card);
		var set = PublishedSet.publish(definition);
		set.retire(NOW);
		assertThat(set.cards().getFirst().retiredAt()).isNull();
		assertThat(set.synchronize(definition, NOW).restored()).isTrue();
		assertThat(set.retiredAt()).isNull();
		assertThat(set.cards().getFirst().contentVersion()).isOne();
	}

	@Test
	void invalidPublicationCannotPartiallyChangeAnExistingAggregate() {
		var set = PublishedSet.publish(definition(card("one", "Question?")));
		var invalid = new CardDefinition("one", "Changed?", "Answer", List.of(), null, null, null);
		assertThatExceptionOfType(InvalidContentException.class)
			.isThrownBy(() -> set.synchronize(definition(invalid), NOW));
		assertThat(set.cards().getFirst().text().question()).isEqualTo("Question?");
		assertThat(set.cards().getFirst().contentVersion()).isOne();
	}

	private static CardDefinition card(String key, String question) {
		return new CardDefinition(key, question, "Answer", List.of(), null, null, "Source");
	}

	private static SetDefinition definition(CardDefinition... cards) {
		return new SetDefinition("test", "test", "Test", "Description", "Revue", "Science", List.of(cards));
	}
}
