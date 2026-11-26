package com.revue.content.infrastructure.persistence;

import com.revue.content.application.PublicSetQueries;
import com.revue.content.application.TrialCards;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPublicSetQueries implements PublicSetQueries {
    private static final String OVERVIEW_FIELDS = """
        select s.id, s.set_key, s.title, s.description, s.publisher_name, s.subject, s.save_allowed,
            (select count(*) from cards c where c.set_id = s.id and c.retired_at is null) as card_count
        """;
    private static final String OVERVIEW = OVERVIEW_FIELDS + ", cast(null as text) as sample_question from ";
    private static final String PREVIEW = OVERVIEW_FIELDS + """
        , (select c.question from cards c where c.set_id = s.id and c.retired_at is null
            order by c.position, c.id limit 1) as sample_question
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
    private static final String TRIAL = """
        select s.title, s.publisher_name, trial.content_key, trial.question, trial.answer,
            trial.explanation, trial.source
        from sets s
        left join lateral (
            select c.content_key, c.question, c.answer, c.explanation, c.source, c.position, c.id
            from cards c where c.set_id = s.id and c.retired_at is null
            order by c.position, c.id limit :limit
        ) trial on true
        where s.set_key = :setKey and s.retired_at is null
        order by trial.position, trial.id
        """;
    private final JdbcClient jdbc;

    JdbcPublicSetQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
        return jdbc.sql(PREVIEW + ACTIVE_SETS + " and s.set_key = ?").param(setKey).query(Overview.class).optional();
    }

    @Override
    public Optional<Overview> summaryById(long id) {
        return jdbc.sql(PREVIEW + ACTIVE_SETS + " and s.id = ?").param(id).query(Overview.class).optional();
    }

    @Override
    public Optional<TrialCards> trialCards(String setKey, int limit) {
        return jdbc.sql(TRIAL).param("setKey", setKey).param("limit", limit).query(JdbcPublicSetQueries::readTrial);
    }

    private static Optional<TrialCards> readTrial(ResultSet rows) throws SQLException {
        if (!rows.next()) {
            return Optional.empty();
        }
        String title = rows.getString("title");
        String publisher = rows.getString("publisher_name");
        List<TrialCards.TrialCard> cards = new ArrayList<>();
        do {
            String key = rows.getString("content_key");
            if (key != null) {
                cards.add(
                    new TrialCards.TrialCard(
                        key,
                        rows.getString("question"),
                        rows.getString("answer"),
                        rows.getString("explanation"),
                        rows.getString("source")));
            }
        } while (rows.next());
        return Optional.of(new TrialCards(title, publisher, cards));
    }
}
