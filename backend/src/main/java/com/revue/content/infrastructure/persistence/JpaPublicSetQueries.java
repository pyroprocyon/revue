package com.revue.content.infrastructure.persistence;

import com.revue.content.application.PublicSetQueries;
import com.revue.content.application.TrialCards;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

@Repository
class JpaPublicSetQueries implements PublicSetQueries {
    private final JpaSharedSetRepository sets;
    private final JpaCardRepository cards;

    JpaPublicSetQueries(JpaSharedSetRepository sets, JpaCardRepository cards) {
        this.sets = sets;
        this.cards = cards;
    }

    @Override
    public List<Overview> list(String afterTitle, long afterId, int limit) {
        var page = afterId == 0
            ? sets.findFirstPage(Limit.of(limit))
            : sets.findAfterTitle(afterTitle, afterId, Limit.of(limit));
        if (page.isEmpty()) {
            return List.of();
        }
        Map<Long, Long> counts = new HashMap<>();
        for (JpaCardRepository.ActiveCardCount row : cards
            .countActiveCardsBySet(page.stream().map(SharedSetRow::id).toList())) {
            counts.put(row.getSetId(), row.getCardCount());
        }
        return page.stream().map(set -> overview(set, counts.getOrDefault(set.id(), 0L))).toList();
    }

    @Override
    public Optional<Overview> summary(String setKey) {
        return sets.findActiveBySetKey(setKey).map(set -> overview(set, cards.countActiveInSet(set)));
    }

    @Override
    public Optional<Overview> summaryById(long id) {
        return sets.findActiveById(id).map(set -> overview(set, cards.countActiveInSet(set)));
    }

    @Override
    public Optional<TrialCards> trialCards(String setKey, int limit) {
        return sets.findActiveBySetKey(setKey).map(set -> {
            List<TrialCards.TrialCard> selected = cards.findActiveInSetOrdered(set, Limit.of(limit))
                .stream()
                .map(
                    card -> new TrialCards.TrialCard(
                        card.contentKey(),
                        card.question(),
                        card.answer(),
                        card.explanation(),
                        card.source()))
                .toList();
            return new TrialCards(set.title(), set.publisherName(), selected);
        });
    }

    private static Overview overview(SharedSetRow set, long count) {
        return new Overview(set.id(), set.setKey(), set.title(), set.description(), set.publisherName(), count);
    }
}
