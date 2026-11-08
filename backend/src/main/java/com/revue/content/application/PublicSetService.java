package com.revue.content.application;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PublicSetService {
	private static final int TRIAL_CARD_COUNT = 5;
	private final PublicSetQueries queries;

	public PublicSetService(PublicSetQueries queries) {
		this.queries = queries;
	}

	public List<PublicSetSummary> list() {
		return queries.list().stream().map(PublicSetService::summaryOf).toList();
	}

	public Optional<PublicSetSummary> summary(String setKey) {
		return queries.summary(setKey).map(PublicSetService::summaryOf);
	}

	public Optional<DemoCards> demoCards(String setKey) {
		return queries.demoCards(setKey, TRIAL_CARD_COUNT)
			.filter(result -> result.cards().size() == TRIAL_CARD_COUNT);
	}

	private static PublicSetSummary summaryOf(PublicSetQueries.Overview set) {
		return new PublicSetSummary(set.setKey(), set.title(), set.description(), set.publisherName(),
			set.cardCount(), set.cardCount() >= TRIAL_CARD_COUNT);
	}
}
