package com.revue.content;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads the public sets for signed-out visitors: the list to choose from, one set's summary, and
 * its five trial cards (plan section 4).
 *
 * <p>Every set loaded from content/public is public, and only active sets and active cards are
 * offered. Until the portfolio release this reads the database on every request, so a visit can
 * wake a paused database (plan section 14, MVP first).
 */
@Service
class PublicSetService {

	private static final int TRIAL_CARD_COUNT = 5;

	private final SharedSetRepository sets;

	private final CardRepository cards;

	PublicSetService(SharedSetRepository sets, CardRepository cards) {
		this.sets = sets;
		this.cards = cards;
	}

	/** Every active set, in title order. */
	@Transactional(readOnly = true)
	List<PublicSetSummary> list() {
		Map<Long, Long> activeCardCounts = new HashMap<>();
		for (CardRepository.ActiveCardCount row : cards.countActiveCardsBySet()) {
			activeCardCounts.put(row.getSetId(), row.getCardCount());
		}
		List<PublicSetSummary> summaries = new ArrayList<>();
		for (SharedSet set : sets.findAllActiveByTitle()) {
			summaries.add(summaryOf(set, activeCardCounts.getOrDefault(set.id(), 0L)));
		}
		return summaries;
	}

	/** Empty when no active set has this key. */
	@Transactional(readOnly = true)
	Optional<PublicSetSummary> summary(String setKey) {
		return sets.findActiveBySetKey(setKey).map(set -> summaryOf(set, cards.countActiveInSet(set)));
	}

	/**
	 * The set's first five active cards by position. Empty when the set isn't offered or has fewer
	 * than five active cards, because the trial never fills the gap with other content.
	 */
	@Transactional(readOnly = true)
	Optional<DemoCards> demoCards(String setKey) {
		Optional<SharedSet> set = sets.findActiveBySetKey(setKey);
		if (set.isEmpty()) {
			return Optional.empty();
		}
		List<Card> trialCards = cards.findActiveInSetOrdered(set.get(), Limit.of(TRIAL_CARD_COUNT));
		if (trialCards.size() < TRIAL_CARD_COUNT) {
			return Optional.empty();
		}
		return Optional.of(DemoCards.from(set.get(), trialCards));
	}

	private static PublicSetSummary summaryOf(SharedSet set, long activeCardCount) {
		boolean trialAvailable = activeCardCount >= TRIAL_CARD_COUNT;
		return new PublicSetSummary(set.setKey(), set.title(), set.description(), set.publisherName(), activeCardCount,
				trialAvailable);
	}

}
