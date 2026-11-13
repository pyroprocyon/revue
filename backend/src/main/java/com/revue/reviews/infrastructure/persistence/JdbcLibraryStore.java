package com.revue.reviews.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.LibraryStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** PostgreSQL membership and schedules; publication text stays in its existing shared rows. */
@Repository
public class JdbcLibraryStore implements LibraryStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcLibraryStore.class);
    private static final String PROJECTION = """
        select s.id, s.set_key, s.title, s.description, s.publisher_name, s.retired_at, s.save_allowed,
               saved.saved_at, (select count(*) from cards c where c.set_id = s.id and c.retired_at is null) card_count
        from saved_sets saved join sets s on s.id = saved.set_id
        where saved.user_id = ?
        """;
    private final JdbcTemplate jdbc;

    /** Creates the transactional JDBC adapter. */
    public JdbcLibraryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public SavedSet save(UUID learner, long setId, String schedulerId, String initialState) {
        // Hold the eligibility decision through the membership write.
        var active = jdbc.queryForList(
            "select id from sets where id = ? and retired_at is null and save_allowed for share",
            Long.class,
            setId);
        if (active.isEmpty()) {
            throw new LibraryProblem(LibraryProblem.Kind.UNAVAILABLE);
        }
        int inserted = jdbc.update("""
            insert into saved_sets(user_id, set_id, saved_at) values (?, ?, clock_timestamp())
            on conflict (user_id, set_id) do nothing
            """, learner, setId);
        jdbc.update("""
            insert into schedules(user_id, card_id, scheduler_id, scheduler_state)
            select ?, id, ?, cast(? as jsonb) from cards where set_id = ? and retired_at is null
            on conflict (user_id, card_id) do nothing
            """, learner, schedulerId, initialState, setId);
        if (inserted == 1) {
            AfterCommit.log(() -> logMembershipChange(learner, setId, true));
        }
        return jdbc.queryForObject(PROJECTION + " and s.id = ?", JdbcLibraryStore::map, learner, setId);
    }

    @Override
    public void remove(UUID learner, long setId) {
        int removed = jdbc.update("delete from saved_sets where user_id = ? and set_id = ?", learner, setId);
        if (removed == 1) {
            AfterCommit.log(() -> logMembershipChange(learner, setId, false));
        }
    }

    @Override
    public List<SavedSet> list(UUID learner, long after, int limit) {
        return jdbc
            .query(PROJECTION + " and s.id > ? order by s.id limit ?", JdbcLibraryStore::map, learner, after, limit);
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
        var event = LOG.atInfo();
        // HTTP requests already carry operation.id in MDC; ECS rejects duplicate nested fields.
        if (MDC.get("operation.id") == null) {
            event.addKeyValue("operation.id", UUID.randomUUID());
        }
        event.addKeyValue("event.name", saved ? "library.set_saved" : "library.set_removed")
            .addKeyValue("event.outcome", "success")
            .addKeyValue("entity.type", "saved_set")
            .addKeyValue("entity.id", setId)
            .addKeyValue("actor.id", learner)
            .addKeyValue("state.from", saved ? "absent" : "saved")
            .addKeyValue("state.to", saved ? "saved" : "absent")
            .log("Library membership changed");
    }

    private static SavedSet map(ResultSet row, int index) throws SQLException {
        return new SavedSet(
            row.getString("id"),
            row.getString("set_key"),
            row.getString("title"),
            row.getString("description"),
            row.getString("publisher_name"),
            row.getLong("card_count"),
            row.getTimestamp("retired_at") != null,
            row.getBoolean("save_allowed"),
            row.getTimestamp("saved_at").toInstant());
    }
}
