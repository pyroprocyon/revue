package com.revue.reviews.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.reviews.application.ReviewStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** PostgreSQL queue projections and conditional writes within the learner's transaction. */
@Repository
public class JdbcReviewStore implements ReviewStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcReviewStore.class);
    private static final String QUEUE = """
        with library as (
            select c.*, s.title as set_title, s.publisher_name, s.created_at as set_created,
                sc.version, sc.next_review_date
            from saved_sets saved join sets s on s.id = saved.set_id
            join cards c on c.set_id = s.id
            left join schedules sc on sc.user_id = saved.user_id and sc.card_id = c.id
            where saved.user_id = :learner
        ), eligible as (
            select * from library where retired_at is null and version is not null
        ), allowance as (
            select greatest(0, 10 - count(*)) as remaining from review_logs
            where user_id = :learner and local_review_date = :today and expected_schedule_version = 0
        ), totals as (
            select (select count(*) from library) as total_cards, count(*) as available_cards,
                count(*) filter (where version > 0 and next_review_date <= :today) as due_cards,
                least(count(*) filter (where version = 0), (select remaining from allowance)) as new_cards,
                least(min(next_review_date) filter (where version > 0),
                    case when count(*) filter (where version = 0) > 0 then cast(:today as date) + 1 end)
                    as next_date
            from eligible
        ), candidates as (
            select * from eligible where version > 0 and next_review_date <= :today
            union all
            (select * from eligible where version = 0 order by set_created, position, id
                limit (select remaining from allowance))
        ), batch as (
            select * from candidates
            order by next_review_date nulls last, set_created, position, id limit :limit
        )
        select totals.*, batch.* from totals left join batch on true
        order by next_review_date nulls last, set_created, position, id
        """;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    /** Creates the JDBC adapter using the application's existing transaction manager. */
    public JdbcReviewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
    }

    @Override
    public void initialize(UUID learner, String profile, String initialState) {
        jdbc.update("""
            insert into schedules(user_id, card_id, scheduler_id, scheduler_state)
            select saved.user_id, c.id, ?, cast(? as jsonb)
            from saved_sets saved join cards c on c.set_id = saved.set_id
            where saved.user_id = ? and c.retired_at is null
            on conflict (user_id, card_id) do nothing
            """, profile, initialState, learner);
    }

    @Override
    public Queue queue(UUID learner, LocalDate today, int limit) {
        return named.query(QUEUE, Map.of("learner", learner, "today", today, "limit", limit), rows -> {
            rows.next();
            long total = rows.getLong("total_cards");
            long available = rows.getLong("available_cards");
            long due = rows.getLong("due_cards");
            long fresh = rows.getLong("new_cards");
            LocalDate next = rows.getObject("next_date", LocalDate.class);
            List<Card> cards = new ArrayList<>();
            do {
                if (rows.getObject("id") != null) {
                    cards.add(card(rows));
                }
            } while (rows.next());
            return new Queue(total, available, due, fresh, next, List.copyOf(cards));
        });
    }

    @Override
    public Optional<Logged> logged(UUID learner, UUID requestId) {
        return jdbc.query("select * from review_logs where user_id = ? and request_id = ?", (row, _) -> {
            var input = new Rating(
                row.getString("rating"),
                row.getString("attempt_mode"),
                requestId,
                row.getLong("expected_schedule_version"),
                row.getInt("reviewed_content_version"));
            var result = new Result(
                row.getString("card_id"),
                requestId,
                row.getTimestamp("reviewed_at").toInstant(),
                row.getObject("recommended_review_date", LocalDate.class),
                row.getObject("next_review_date", LocalDate.class),
                row.getLong("schedule_version_after"));
            return new Logged(input, result);
        }, learner, requestId).stream().findFirst();
    }

    @Override
    public Optional<Schedule> schedule(UUID learner, long cardId) {
        return jdbc
            .query(
                """
                    select sc.* from schedules sc join cards c on c.id = sc.card_id
                    join saved_sets saved on saved.user_id = sc.user_id and saved.set_id = c.set_id
                    where sc.user_id = ? and sc.card_id = ? and c.retired_at is null
                    """,
                (row, _) -> new Schedule(
                    row.getString("scheduler_id"),
                    row.getString("scheduler_state"),
                    row.getLong("version"),
                    row.getObject("next_review_date", LocalDate.class)),
                learner,
                cardId)
            .stream()
            .findFirst();
    }

    @Override
    public int introduced(UUID learner, LocalDate today) {
        return jdbc.queryForObject("""
            select count(*) from review_logs
            where user_id = ? and local_review_date = ? and expected_schedule_version = 0
            """, Integer.class, learner, today);
    }

    @Override
    public boolean insert(UUID learner, Rating input, Result result, LocalDate day, String profile) {
        return jdbc.update(
            """
                insert into review_logs(user_id, card_id, request_id, review_contract, rating, attempt_mode,
                    expected_schedule_version, reviewed_content_version, reviewed_at, local_review_date,
                    scheduler_id, recommended_review_date, next_review_date, schedule_version_after)
                values (?, ?, ?, 'mvp-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (user_id, request_id) do nothing
                """,
            learner,
            Long.parseLong(result.cardId()),
            input.requestId(),
            input.rating(),
            input.attemptMode(),
            input.expectedVersion(),
            input.contentVersion(),
            Timestamp.from(result.reviewedAt()),
            day,
            profile,
            result.recommendedReviewDate(),
            result.nextReviewDate(),
            result.scheduleVersion()) == 1;
    }

    @Override
    public boolean advance(UUID learner, Rating input, Result result, String state) {
        return jdbc.update(
            """
                update schedules set scheduler_state = cast(? as jsonb), last_reviewed_at = ?,
                    last_reviewed_content_version = ?, recommended_review_date = ?, next_review_date = ?, version = ?
                where user_id = ? and card_id = ? and version = ?
                """,
            state,
            Timestamp.from(result.reviewedAt()),
            input.contentVersion(),
            result.recommendedReviewDate(),
            result.nextReviewDate(),
            result.scheduleVersion(),
            learner,
            Long.parseLong(result.cardId()),
            input.expectedVersion()) == 1;
    }

    @Override
    public void saved(UUID learner, Rating input, Result result) {
        AfterCommit.log(() -> {
            var event = LOG.atInfo();
            if (MDC.get("operation.id") == null) {
                event.addKeyValue("operation.id", input.requestId());
            }
            event.addKeyValue("event.name", "review.saved")
                .addKeyValue("event.outcome", "success")
                .addKeyValue("entity.type", "review")
                .addKeyValue("entity.id", input.requestId())
                .addKeyValue("actor.id", learner)
                .addKeyValue("card.id", result.cardId())
                .addKeyValue("state.from", input.expectedVersion())
                .addKeyValue("state.to", result.scheduleVersion())
                .log("Review saved");
        });
    }

    private static Card card(ResultSet row) throws SQLException {
        var ideas = row.getArray("key_ideas");
        try {
            return new Card(
                row.getString("id"),
                row.getString("question"),
                row.getString("answer"),
                row.getString("explanation"),
                row.getString("memory_hook"),
                row.getString("source"),
                List.copyOf(Arrays.asList((String[]) ideas.getArray())),
                row.getString("set_title"),
                row.getString("publisher_name"),
                row.getInt("content_version"),
                row.getLong("version"));
        } finally {
            ideas.free();
        }
    }
}
