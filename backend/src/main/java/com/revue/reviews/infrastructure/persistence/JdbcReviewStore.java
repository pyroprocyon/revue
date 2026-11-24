package com.revue.reviews.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.reviews.application.ReviewStore;
import com.revue.reviews.domain.AttemptMode;
import com.revue.reviews.domain.ReviewRating;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** PostgreSQL queue projections and conditional writes within the learner's transaction. */
@Repository
public class JdbcReviewStore implements ReviewStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcReviewStore.class);
    private static final String LEARNER_PARAMETER = "learner";
    private static final String OPERATION_ID = "operation.id";
    static final String DEFAULT_LIMIT_PARAMETER = "defaultNewCardLimit";
    private static final String NEW_CARD_LIMIT = """
        select coalesce(
            (select daily_new_card_limit from study_settings where user_id = :learner), :defaultNewCardLimit)
        """;
    static final String NEW_CARD_ALLOWANCE = """
        select greatest(0, (
        """ + NEW_CARD_LIMIT + """
        ) - (
            select count(*) from review_logs
            where user_id = :learner and local_review_date = :today and expected_schedule_version = 0
        )) as remaining
        """;
    private static final String STUDY_CARDS = """
        with study as (
        select c.id, c.retired_at, c.position, s.title as collection_title, s.publisher_name, s.created_at as collection_created,
            'set-' || s.id as topic_id
        from saved_sets saved join sets s on s.id = saved.set_id join cards c on c.set_id = s.id
        where saved.user_id = :learner and not saved.reviews_paused
        union all
        select c.id, c.retired_at, c.position, d.title, null, d.created_at, 'deck-' || d.id
        from decks d join cards c on c.deck_id = d.id
        where d.owner_id = :learner and not d.archived
        )
        """;
    private static final String SCOPED_CARDS = STUDY_CARDS + """
        , scoped as (select * from study where cast(:topic as text) is null or topic_id = :topic)
        """;
    private static final String INITIALIZE = SCOPED_CARDS + """
        insert into schedules(user_id, card_id, scheduler_id, scheduler_state)
        select :learner, study.id, :profile, cast(:initialState as jsonb)
        from scoped study
        where study.retired_at is null
            and not exists (select 1 from schedules sc where sc.user_id = :learner and sc.card_id = study.id)
        on conflict (user_id, card_id) do nothing
        """;
    private static final String RATING_STATE = STUDY_CARDS + """
        , previous as (select * from review_logs where user_id = :learner and request_id = :request),
        current_schedule as (
            select sc.* from schedules sc join study on study.id = sc.card_id
            where sc.user_id = :learner and sc.card_id = :card and study.retired_at is null
                and not exists (select 1 from previous)
        )
        select p.*, sc.scheduler_id as current_profile, sc.scheduler_state, sc.version, sc.next_review_date as due,
            case when sc.version = 0 then (
        """ + NEW_CARD_ALLOWANCE + """
            ) else 0 end as new_cards_left
        from (values (1)) anchor(n) left join previous p on true left join current_schedule sc on true
        """;
    private static final String LOCKED_STUDY_CARD = STUDY_CARDS + """
        select study.id, study.collection_title, study.publisher_name, c.question, c.answer, c.explanation,
            c.memory_hook, c.source, c.content_version, sc.version
        from study join cards c on c.id = study.id
        join schedules sc on sc.user_id = :learner and sc.card_id = study.id
        where study.id = :card and c.retired_at is null
        for share of c
        """;
    // The one queue order (plan section 9). Topics are listed by where their first due card sits in it.
    private static final String QUEUE_ORDER = "next_review_date nulls last, collection_created, position, id";
    // Stale statistics after schedule repair produced 12.5 million join comparisons for one 5,000-card deck.
    private static final String QUEUE = SCOPED_CARDS + """
        , library as (
            select study.*, coalesce(sc.version, 0) as version, sc.next_review_date, sc.card_id is null as unscheduled
            from scoped study
            left join lateral (
                select card_id, version, next_review_date from schedules
                where user_id = :learner and card_id = study.id limit 1
            ) sc on true
        ), eligible as (
            select * from library where retired_at is null
        ), allowance as (
        """ + NEW_CARD_ALLOWANCE + """
        ), totals as (
            select (select count(*) from library) as total_cards, count(*) as available_cards,
                count(*) filter (where unscheduled) > 0 as missing_schedules,
                min(collection_title) filter (where cast(:topic as text) is not null) as topic_title,
                count(*) filter (where version > 0 and next_review_date <= :today) as due_cards,
                count(*) filter (where version = 0) as unintroduced_cards,
                least(count(*) filter (where :includeNew and version = 0), (select remaining from allowance))
                    as new_cards,
                min(next_review_date) filter (where version > 0) as next_date
            from eligible
        ), due_topics as (
            select topic_id, collection_title, count(*) as due, min(queue_position) as first_in_queue
            from (select *, row_number() over (order by
        """ + QUEUE_ORDER + """
            ) as queue_position from eligible
                where cast(:topic as text) is null and version > 0 and next_review_date <= :today) due
            group by topic_id, collection_title
        ), candidates as (
            select * from eligible where version > 0 and next_review_date <= :today
            union all
            (select * from eligible where :includeNew and version = 0 order by collection_created, position, id
                limit (select remaining from allowance))
        ), batch as (
            select * from candidates order by
        """ + QUEUE_ORDER + """
            limit :limit
        )
        select totals.*, batch.*, c.question, c.answer, c.explanation, c.memory_hook, c.source, c.content_version, (
            select coalesce(jsonb_agg(jsonb_build_object('id', topic_id, 'title', collection_title, 'dueCards', due)
                order by first_in_queue), '[]'::jsonb)
            from due_topics
        ) as topics, case when cast(:topic as text) is null then (
            select jsonb_agg(jsonb_build_object('date', day, 'studied', exists (
                select 1 from review_logs where user_id = :learner and local_review_date = day
            )) order by day) from (
                select cast(:today as date) - n as day from generate_series(0, 6) as offsets(n)
            ) week
        ) else '[]'::jsonb end as study_days, case when cast(:pausedTopic as text) is not null then (
            select jsonb_build_object('topicTitle', min(collection_title),
                'dueCards', count(*) filter (where version > 0 and next_review_date <= :today),
                'newCards', least(count(*) filter (where version = 0), (select remaining from allowance)),
                'unintroducedCards', count(*) filter (where version = 0))
            from eligible where topic_id = :pausedTopic
        ) end as continuation from totals left join batch on true left join cards c on c.id = batch.id
        order by batch.next_review_date nulls last, batch.collection_created, batch.position, batch.id
        """;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final JsonMapper json;

    public JdbcReviewStore(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.json = json;
    }

    @Override
    public int dailyNewCardLimit(UUID learner) {
        return named.queryForObject(
            NEW_CARD_LIMIT,
            Map.of(LEARNER_PARAMETER, learner, DEFAULT_LIMIT_PARAMETER, DEFAULT_DAILY_NEW_CARD_LIMIT),
            Integer.class);
    }

    @Override
    public void saveDailyNewCardLimit(UUID learner, int previousLimit, int limit) {
        jdbc.update("""
            insert into study_settings(user_id, daily_new_card_limit) values (?, ?)
            on conflict (user_id) do update set daily_new_card_limit = excluded.daily_new_card_limit
            """, learner, limit);
        AfterCommit.log(() -> {
            var event = LOG.atInfo();
            if (MDC.get(OPERATION_ID) == null) {
                event.addKeyValue(OPERATION_ID, UUID.randomUUID());
            }
            event.addKeyValue("event.name", "study.daily_new_card_limit_changed")
                .addKeyValue("event.outcome", "success")
                .addKeyValue("entity.type", "study_settings")
                .addKeyValue("actor.id", learner)
                .addKeyValue("state.from", previousLimit)
                .addKeyValue("state.to", limit)
                .log("Daily new card limit changed");
        });
    }

    @Override
    public void initialize(UUID learner, String profile, String initialState, @Nullable String topic) {
        named.update(
            INITIALIZE,
            new MapSqlParameterSource().addValue(LEARNER_PARAMETER, learner)
                .addValue("profile", profile)
                .addValue("initialState", initialState)
                .addValue("topic", topic, java.sql.Types.VARCHAR));
    }

    @Override
    public QueueRead queue(
        UUID learner,
        LocalDate today,
        int limit,
        @Nullable String topic,
        boolean includeNew,
        @Nullable String pausedTopic) {
        var parameters = new MapSqlParameterSource().addValue(LEARNER_PARAMETER, learner)
            .addValue("today", today)
            .addValue("limit", limit)
            .addValue("topic", topic, java.sql.Types.VARCHAR)
            .addValue("pausedTopic", pausedTopic, java.sql.Types.VARCHAR)
            .addValue("includeNew", includeNew)
            .addValue(DEFAULT_LIMIT_PARAMETER, DEFAULT_DAILY_NEW_CARD_LIMIT);
        return named.query(QUEUE, parameters, rows -> {
            rows.next();
            boolean missingSchedules = rows.getBoolean("missing_schedules");
            List<StudyDay> studyDays = json.readerForListOf(StudyDay.class).readValue(rows.getString("study_days"));
            long total = rows.getLong("total_cards");
            long available = rows.getLong("available_cards");
            long due = rows.getLong("due_cards");
            long fresh = rows.getLong("new_cards");
            long unintroduced = rows.getLong("unintroduced_cards");
            LocalDate next = rows.getObject("next_date", LocalDate.class);
            String topicTitle = rows.getString("topic_title");
            List<Topic> topics = json.readerForListOf(Topic.class).readValue(rows.getString("topics"));
            String continuation = rows.getString("continuation");
            List<Card> cards = new ArrayList<>();
            do {
                if (rows.getObject("id") != null) {
                    cards.add(card(rows));
                }
            } while (rows.next());
            var queue = new Queue(
                total,
                available,
                due,
                fresh,
                next,
                List.copyOf(cards),
                List.copyOf(topics),
                studyDays,
                topicTitle,
                unintroduced,
                continuation == null ? null : json.readValue(continuation, Continuation.class));
            return new QueueRead(queue, missingSchedules);
        });
    }

    @Override
    public Optional<Logged> logged(UUID learner, UUID requestId) {
        return jdbc
            .query(
                "select * from review_logs where user_id = ? and request_id = ?",
                (row, _) -> logged(row, requestId),
                learner,
                requestId)
            .stream()
            .findFirst();
    }

    private static Logged logged(ResultSet row, UUID requestId) throws SQLException {
        var input = new Rating(
            ReviewRating.valueOf(row.getString("rating")),
            AttemptMode.valueOf(row.getString("attempt_mode")),
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
    }

    @Override
    public RatingState ratingState(UUID learner, long cardId, UUID requestId, LocalDate today) {
        return named.queryForObject(
            RATING_STATE,
            Map.of(
                LEARNER_PARAMETER,
                learner,
                "card",
                cardId,
                "request",
                requestId,
                "today",
                today,
                DEFAULT_LIMIT_PARAMETER,
                DEFAULT_DAILY_NEW_CARD_LIMIT),
            (row, _) -> {
                Logged previous = row.getObject("request_id") == null ? null : logged(row, requestId);
                String profile = row.getString("current_profile");
                Schedule schedule = profile == null
                    ? null
                    : new Schedule(
                        profile,
                        row.getString("scheduler_state"),
                        row.getLong("version"),
                        row.getObject("due", LocalDate.class));
                return new RatingState(previous, schedule, row.getInt("new_cards_left"));
            });
    }

    @Override
    public Optional<Card> lockStudyCard(UUID learner, long cardId) {
        return named.query(LOCKED_STUDY_CARD, Map.of(LEARNER_PARAMETER, learner, "card", cardId), (row, _) -> card(row))
            .stream()
            .findFirst();
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
            input.rating().name(),
            input.attemptMode().name(),
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
            if (MDC.get(OPERATION_ID) == null) {
                event.addKeyValue(OPERATION_ID, input.requestId());
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
        return new Card(
            row.getString("id"),
            row.getString("question"),
            row.getString("answer"),
            row.getString("explanation"),
            row.getString("memory_hook"),
            row.getString("source"),
            List.of(),
            row.getString("collection_title"),
            row.getString("publisher_name"),
            row.getInt("content_version"),
            row.getLong("version"));
    }
}
