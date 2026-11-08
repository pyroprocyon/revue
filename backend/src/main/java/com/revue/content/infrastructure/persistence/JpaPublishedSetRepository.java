package com.revue.content.infrastructure.persistence;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.revue.content.domain.PublishedCard;
import com.revue.content.domain.PublishedSet;
import com.revue.content.domain.PublishedSetRepository;
import org.springframework.stereotype.Repository;

/** Maps aggregate snapshots onto the existing rows. Numeric IDs and audit timestamps stay in JPA. */
@Repository
class JpaPublishedSetRepository implements PublishedSetRepository {
	private final JpaSharedSetRepository sets;
	private final JpaCardRepository cards;

	JpaPublishedSetRepository(JpaSharedSetRepository sets, JpaCardRepository cards) {
		this.sets = sets;
		this.cards = cards;
	}

	@Override
	public List<PublishedSet> findAll() {
		Map<String, List<PublishedCard>> cardsBySet = new HashMap<>();
		for (CardRow card : cards.findAllWithSet()) {
			cardsBySet.computeIfAbsent(card.sharedSet().setKey(), key -> new ArrayList<>()).add(card.toDomain());
		}
		return sets.findAll().stream()
			.map(set -> set.toDomain(cardsBySet.getOrDefault(set.setKey(), List.of()))).toList();
	}

	@Override
	public void saveAll(List<PublishedSet> publications) {
		Map<String, SharedSetRow> setsByKey = new HashMap<>();
		for (SharedSetRow set : sets.findAll()) {
			setsByKey.put(set.setKey(), set);
		}
		Map<String, CardRow> cardsByKey = new HashMap<>();
		for (CardRow card : cards.findAllWithSet()) {
			cardsByKey.put(card.contentKey(), card);
		}
		for (PublishedSet publication : publications) {
			SharedSetRow row = setsByKey.get(publication.key());
			if (row == null) {
				row = sets.save(new SharedSetRow(publication.key()));
			}
			row.updateFrom(publication);
			for (PublishedCard card : publication.cards()) {
				CardRow cardRow = cardsByKey.get(card.key());
				if (cardRow == null) {
					cardRow = new CardRow(row, card.key());
					cardRow.updateFrom(card);
					cards.save(cardRow);
				}
				else {
					cardRow.updateFrom(card);
				}
			}
		}
	}
}
