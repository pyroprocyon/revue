package com.revue.content.infrastructure.persistence;

import com.revue.content.domain.PublishedCard;
import com.revue.content.domain.PublishedSet;
import com.revue.content.domain.PublishedSetRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    public Catalog loadCatalog() {
        return new LoadedCatalog(sets.findAll(), cards.findAllWithSet());
    }

    private final class LoadedCatalog implements Catalog {
        private final Map<String, SharedSetRow> setsByKey = new HashMap<>();
        private final Map<String, CardRow> cardsByKey = new HashMap<>();
        private final List<PublishedSet> existingSets;

        private LoadedCatalog(List<SharedSetRow> setRows, List<CardRow> cardRows) {
            Map<String, List<PublishedCard>> cardsBySet = new HashMap<>();
            for (CardRow card : cardRows) {
                cardsByKey.put(card.contentKey(), card);
                cardsBySet.computeIfAbsent(card.sharedSet().setKey(), key -> new ArrayList<>()).add(card.toDomain());
            }
            for (SharedSetRow set : setRows) {
                setsByKey.put(set.setKey(), set);
            }
            existingSets =
                    setRows.stream()
                            .map(set -> set.toDomain(cardsBySet.getOrDefault(set.setKey(), List.of())))
                            .toList();
        }

        @Override
        public List<PublishedSet> existingSets() {
            return existingSets;
        }

        @Override
        public void saveAll(List<PublishedSet> publications) {
            for (PublishedSet publication : publications) {
                SharedSetRow row = setsByKey.get(publication.key());
                if (row == null) {
                    row = sets.save(new SharedSetRow(publication.key()));
                    setsByKey.put(publication.key(), row);
                }
                row.updateFrom(publication);
                for (PublishedCard card : publication.cards()) {
                    CardRow cardRow = cardsByKey.get(card.key());
                    if (cardRow == null) {
                        cardRow = new CardRow(row, card.key());
                        cardRow.updateFrom(card);
                        cards.save(cardRow);
                        cardsByKey.put(card.key(), cardRow);
                    } else {
                        cardRow.updateFrom(card);
                    }
                }
            }
        }
    }
}
