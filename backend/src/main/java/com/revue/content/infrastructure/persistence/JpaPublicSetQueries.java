package com.revue.content.infrastructure.persistence;

import com.revue.content.application.PublicSetQueries;
import com.revue.content.application.TrialCards;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JpaPublicSetQueries implements PublicSetQueries {
    private static final String OVERVIEW = """
        select s.id, s.set_key, s.title, s.description, s.publisher_name, s.save_allowed,
            (select count(*) from cards c where c.set_id = s.id and c.retired_at is null) as card_count
        from
        """;
    private static final String ACTIVE_SETS = "sets s where s.retired_at is null";
    private static final String PAGE_ORDER = " order by s.title, s.id limit :limit";
    private final JdbcClient jdbc;
    private final JpaSharedSetRepository sets;
    private final JpaCardRepository cards;

    JpaPublicSetQueries(JdbcClient jdbc, JpaSharedSetRepository sets, JpaCardRepository cards) {
        this.jdbc = jdbc;
        this.sets = sets;
        this.cards = cards;
    }

    @Override
    public List<Overview> list(String afterTitle, long afterId, int limit) {
        var page = afterId == 0
            ? jdbc.sql(OVERVIEW + ACTIVE_SETS + PAGE_ORDER)
            : jdbc.sql(OVERVIEW + ACTIVE_SETS + " and (s.title, s.id) > (:title, :id)" + PAGE_ORDER)
                .param("title", afterTitle)
                .param("id", afterId);
        return page.param("limit", limit).query(Overview.class).list();
    }

    @Override
    public Optional<Overview> summary(String setKey) {
        return jdbc.sql(OVERVIEW + ACTIVE_SETS + " and s.set_key = ?").param(setKey).query(Overview.class).optional();
    }

    @Override
    public Optional<Overview> summaryById(long id) {
        return jdbc.sql(OVERVIEW + ACTIVE_SETS + " and s.id = ?").param(id).query(Overview.class).optional();
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

}
