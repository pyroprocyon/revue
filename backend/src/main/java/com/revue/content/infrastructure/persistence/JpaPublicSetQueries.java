package com.revue.content.infrastructure.persistence;

import com.revue.content.application.PublicSetQueries;
import com.revue.content.application.TrialCards;
import java.sql.Types;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Limit;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JpaPublicSetQueries implements PublicSetQueries {
    private static final String OVERVIEW = """
        select s.id, s.set_key, s.title, s.description, s.publisher_name, s.subject, s.save_allowed,
            (select count(*) from cards c where c.set_id = s.id and c.retired_at is null) as card_count
        from
        """;
    private static final String ACTIVE_SETS = "sets s where s.retired_at is null";
    private static final String SUBJECT = "coalesce(nullif(btrim(s.subject), ''), 'Other subjects')";
    private static final String LIST_SCOPE = ACTIVE_SETS + " and (s.save_allowed or not :saveableOnly)"
        + " and (cast(:subject as text) is null or " + SUBJECT + " = :subject)"
        + " and (:search = '' or strpos(lower(s.title), lower(:search)) > 0)";
    private static final String PAGE_ORDER = " order by s.title, s.id limit :limit";
    private static final String ONBOARDING_SCOPE = ACTIVE_SETS
        + " and not s.save_allowed and s.set_key in (:keys) order by s.title, s.id";
    private final JdbcClient jdbc;
    private final JpaSharedSetRepository sets;
    private final JpaCardRepository cards;

    JpaPublicSetQueries(JdbcClient jdbc, JpaSharedSetRepository sets, JpaCardRepository cards) {
        this.jdbc = jdbc;
        this.sets = sets;
        this.cards = cards;
    }

    @Override
    public List<Overview> list(
        String afterTitle,
        long afterId,
        int limit,
        boolean saveableOnly,
        @Nullable String subject,
        String search) {
        var page = afterId == 0
            ? jdbc.sql(OVERVIEW + LIST_SCOPE + PAGE_ORDER)
            : jdbc.sql(OVERVIEW + LIST_SCOPE + " and (s.title, s.id) > (:title, :id)" + PAGE_ORDER)
                .param("title", afterTitle)
                .param("id", afterId);
        return page.param("saveableOnly", saveableOnly)
            .param("subject", subject, Types.VARCHAR)
            .param("search", search)
            .param("limit", limit)
            .query(Overview.class)
            .list();
    }

    @Override
    public List<Subject> subjects() {
        String sql = "select " + SUBJECT + " as subject, count(*) as topic_count from " + ACTIVE_SETS
            + " and s.save_allowed group by 1 order by 1";
        return jdbc.sql(sql).query(Subject.class).list();
    }

    @Override
    public List<Overview> onboarding(List<String> keys) {
        return jdbc.sql(OVERVIEW + ONBOARDING_SCOPE).param("keys", keys).query(Overview.class).list();
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
