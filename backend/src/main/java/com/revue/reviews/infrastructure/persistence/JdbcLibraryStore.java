package com.revue.reviews.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.reviews.application.DeckStore.CardBatch;
import com.revue.reviews.application.DeckStore.CardQuery;
import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.LibraryStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** PostgreSQL membership and schedules; publication text stays in its existing shared rows. */
@Repository
public class JdbcLibraryStore implements LibraryStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcLibraryStore.class);
    private static final String ACTIVE = "active";
    private static final String PAUSED = "paused";
    private static final String SAVED_SET_FIELDS = """
        s.id, s.set_key, s.title, s.description, s.publisher_name, s.retired_at, s.save_allowed,
            saved.saved_at, saved.reviews_paused
        """;
    private static final String SAVED_SET = """
        select %s, (select count(*) from cards c where c.set_id = s.id and c.retired_at is null) as card_count
        from saved_sets saved join sets s on s.id = saved.set_id
        where saved.user_id = ? and s.id = ?
        """.formatted(SAVED_SET_FIELDS);
    private static final String SAVED_SET_PAGE = """
        with membership as (
            select set_id, saved_at, reviews_paused from saved_sets
            where user_id = ?
        ), counts as (
            select count(*) filter (where not reviews_paused) as active,
                count(*) filter (where reviews_paused) as paused
            from membership
        ), page as (
            select %s, count(c.id) as card_count
            from (
                select set_id, saved_at, reviews_paused from membership
                where set_id > ? and (cast(? as boolean) is null or reviews_paused = ?)
                order by set_id limit ?
            ) saved join sets s on s.id = saved.set_id
            left join cards c on c.set_id = s.id and c.retired_at is null
            group by s.id, saved.saved_at, saved.reviews_paused
        )
        select page.*, counts.active, counts.paused
        from counts left join page on true
        order by page.id
        """.formatted(SAVED_SET_FIELDS);
    private final JdbcTemplate jdbc;
    private final JdbcCardBrowser browser;

    public JdbcLibraryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.browser = new JdbcCardBrowser(jdbc);
    }

    @Override
    public SavedSet save(UUID learner, long setId, String schedulerId, String initialState, int limit) {
        // Hold the eligibility decision through the membership write.
        var active = jdbc.queryForList(
            "select id from sets where id = ? and retired_at is null and save_allowed for share",
            Long.class,
            setId);
        if (active.isEmpty()) {
            throw new LibraryProblem(LibraryProblem.Kind.UNAVAILABLE);
        }
        int inserted = jdbc.update("""
            insert into saved_sets(user_id, set_id, saved_at)
            select ?, ?, clock_timestamp()
            where (select count(*) from saved_sets where user_id = ?) < ?
            on conflict (user_id, set_id) do nothing
            """, learner, setId, learner, limit);
        if (inserted == 0 && !contains(learner, setId)) {
            throw new LibraryProblem(LibraryProblem.Kind.SAVED_SET_LIMIT);
        }
        jdbc.update("""
            insert into schedules(user_id, card_id, scheduler_id, scheduler_state)
            select ?, id, ?, cast(? as jsonb) from cards where set_id = ? and retired_at is null
            on conflict (user_id, card_id) do nothing
            """, learner, schedulerId, initialState, setId);
        if (inserted == 1) {
            AfterCommit.log(() -> logMembershipChange(learner, setId, true));
        }
        return jdbc.queryForObject(SAVED_SET, (row, _) -> mapSavedSet(row), learner, setId);
    }

    @Override
    public void remove(UUID learner, long setId) {
        int removed = jdbc.update("delete from saved_sets where user_id = ? and set_id = ?", learner, setId);
        if (removed == 1) {
            AfterCommit.log(() -> logMembershipChange(learner, setId, false));
        }
    }

    @Override
    public void setReviewsPaused(UUID learner, long setId, boolean paused) {
        int changed = jdbc.update("""
            update saved_sets set reviews_paused = ?
            where user_id = ? and set_id = ? and reviews_paused <> ?
            """, paused, learner, setId, paused);
        if (changed == 1) {
            AfterCommit.log(
                () -> logSetChange(
                    learner,
                    setId,
                    paused ? "library.set_reviews_paused" : "library.set_reviews_resumed",
                    paused ? ACTIVE : PAUSED,
                    paused ? PAUSED : ACTIVE,
                    "Saved set review participation changed"));
        } else if (!contains(learner, setId)) {
            throw new LibraryProblem(LibraryProblem.Kind.UNAVAILABLE);
        }
    }

    @Override
    public SavedSetPage list(UUID learner, long after, int limit, @Nullable Boolean paused) {
        return jdbc.query(SAVED_SET_PAGE, JdbcLibraryStore::mapPage, learner, after, paused, paused, limit);
    }

    @Override
    public List<String> savedKeys(UUID learner) {
        return jdbc.queryForList("""
            select s.set_key from saved_sets saved join sets s on s.id = saved.set_id
            where saved.user_id = ? order by saved.set_id
            """, String.class, learner);
    }

    @Override
    public Optional<SavedSet> find(UUID learner, long setId) {
        return jdbc.query(SAVED_SET, (row, _) -> mapSavedSet(row), learner, setId).stream().findFirst();
    }

    @Override
    public Optional<CardBatch> cardBatch(UUID learner, long setId, CardQuery query) {
        return browser.savedSet(learner, setId, query);
    }

    @Override
    public boolean contains(UUID learner, long setId) {
        return Boolean.TRUE.equals(
            jdbc.queryForObject(
                "select exists(select 1 from saved_sets where user_id = ? and set_id = ?)",
                Boolean.class,
                learner,
                setId));
    }

    private static void logMembershipChange(UUID learner, long setId, boolean saved) {
        logSetChange(
            learner,
            setId,
            saved ? "library.set_saved" : "library.set_removed",
            saved ? "absent" : "saved",
            saved ? "saved" : "absent",
            "Library membership changed");
    }

    private static void logSetChange(UUID learner, long setId, String name, String from, String to, String message) {
        var event = LOG.atInfo();
        // HTTP requests already carry operation.id in MDC; ECS rejects duplicate nested fields.
        if (MDC.get("operation.id") == null) {
            event.addKeyValue("operation.id", UUID.randomUUID());
        }
        event.addKeyValue("event.name", name)
            .addKeyValue("event.outcome", "success")
            .addKeyValue("entity.type", "saved_set")
            .addKeyValue("entity.id", setId)
            .addKeyValue("actor.id", learner)
            .addKeyValue("state.from", from)
            .addKeyValue("state.to", to)
            .log(message);
    }

    private static SavedSetPage mapPage(ResultSet rows) throws SQLException {
        if (!rows.next()) {
            throw new IllegalStateException("Library page omitted review counts");
        }
        var counts = new ReviewCounts(rows.getLong(ACTIVE), rows.getLong(PAUSED));
        List<SavedSet> items = new ArrayList<>();
        do {
            if (rows.getString("id") != null) {
                items.add(mapSavedSet(rows));
            }
        } while (rows.next());
        return new SavedSetPage(items, counts);
    }

    private static SavedSet mapSavedSet(ResultSet row) throws SQLException {
        return new SavedSet(
            row.getString("id"),
            row.getString("set_key"),
            row.getString("title"),
            row.getString("description"),
            row.getString("publisher_name"),
            row.getLong("card_count"),
            row.getTimestamp("retired_at") != null,
            row.getBoolean("save_allowed"),
            row.getBoolean("reviews_paused"),
            row.getTimestamp("saved_at").toInstant());
    }
}
