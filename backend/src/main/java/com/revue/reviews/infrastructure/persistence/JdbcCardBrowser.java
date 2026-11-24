package com.revue.reviews.infrastructure.persistence;

import com.revue.reviews.application.DeckStore.Card;
import com.revue.reviews.application.DeckStore.CardBatch;
import com.revue.reviews.application.DeckStore.CardQuery;
import com.revue.reviews.application.DeckStore.Deck;
import com.revue.reviews.application.DeckStore.Progress;
import com.revue.reviews.application.ReviewStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

final class JdbcCardBrowser {
    private static final String DECK = """
        select id as collection_id, title, archived, id as deck_id, null::bigint as set_id
        from decks where owner_id = :learner and id = :id
        """;
    private static final String SAVED_SET = """
        select s.id as collection_id, s.title, saved.reviews_paused as archived, null::bigint as deck_id, s.id as set_id
        from saved_sets saved join sets s on s.id = saved.set_id
        where saved.user_id = :learner and s.id = :id
        """;
    private static final String DECK_CARDS = "c.deck_id = d.deck_id";
    private static final String SAVED_CARDS = "c.set_id = d.set_id and c.retired_at is null";
    private static final String CARDS = """
        with collection as materialized (%s), studied as materialized (
            select c.id, s.version, s.next_review_date,
                coalesce(not d.archived and s.version > 0 and s.next_review_date <= cast(:today as date), false) as due
            from collection d
            join cards c on %s
            left join schedules s on s.user_id = :learner and s.card_id = c.id
        ), progress as (
            select count(*) as card_count, count(*) filter (where due) as due_cards,
                count(*) filter (where coalesce(version, 0) = 0) as new_cards,
                min(next_review_date) filter (where version > 0 and next_review_date > cast(:today as date))
                    as next_review_date
            from studied
        ), allowance as (%s)
        select d.collection_id, d.title, d.archived, p.card_count, p.due_cards,
            case when d.archived then 0 else p.new_cards end as new_cards, a.remaining as new_cards_left_today,
            case when d.archived then null else p.next_review_date end as next_review_date,
            c.id, c.question, c.answer, c.explanation, c.memory_hook, c.source, c.content_version, c.due
        from collection d cross join progress p cross join allowance a
        left join lateral (
            select c.id, c.question, c.answer, c.explanation, c.memory_hook, c.source, c.content_version, st.due
            from studied st join cards c on c.id = st.id
            where %s and c.id > :after
                and (cast(:search as text) = '' or strpos(lower(c.question), lower(:search)) > 0
                    or strpos(lower(c.answer), lower(:search)) > 0)
                and (not cast(:dueOnly as boolean) or st.due)
            order by st.id limit :limit
        ) c on true
        order by c.id
        """;
    private final NamedParameterJdbcTemplate jdbc;

    JdbcCardBrowser(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    Optional<CardBatch> deck(UUID owner, long deckId, CardQuery query) {
        String sql = CARDS.formatted(DECK, DECK_CARDS, JdbcReviewStore.NEW_CARD_ALLOWANCE, DECK_CARDS);
        return read(sql, owner, deckId, query);
    }

    Optional<CardBatch> savedSet(UUID learner, long setId, CardQuery query) {
        String sql = CARDS.formatted(SAVED_SET, SAVED_CARDS, JdbcReviewStore.NEW_CARD_ALLOWANCE, SAVED_CARDS);
        return read(sql, learner, setId, query);
    }

    private Optional<CardBatch> read(String sql, UUID learner, long id, CardQuery query) {
        var parameters = new MapSqlParameterSource().addValue("learner", learner)
            .addValue("id", id)
            .addValue("search", query.search())
            .addValue("after", query.afterCardId())
            .addValue("limit", query.limit())
            .addValue("dueOnly", query.dueOnly())
            .addValue("today", query.today())
            .addValue(JdbcReviewStore.DEFAULT_LIMIT_PARAMETER, ReviewStore.DEFAULT_DAILY_NEW_CARD_LIMIT);
        return jdbc.query(sql, parameters, JdbcCardBrowser::toCardBatch);
    }

    private static Optional<CardBatch> toCardBatch(ResultSet rows) throws SQLException {
        if (!rows.next()) {
            return Optional.empty();
        }
        Deck deck = new Deck(
            rows.getString("collection_id"),
            rows.getString("title"),
            rows.getLong("card_count"),
            rows.getBoolean("archived"));
        Progress progress = new Progress(
            rows.getLong("due_cards"),
            rows.getLong("new_cards"),
            rows.getLong("new_cards_left_today"),
            rows.getObject("next_review_date", LocalDate.class));
        List<Card> cards = new ArrayList<>();
        Set<String> due = new HashSet<>();
        do {
            if (rows.getString("id") != null) {
                cards.add(JdbcDeckStore.toCard(rows, 0));
                if (rows.getBoolean("due")) {
                    due.add(rows.getString("id"));
                }
            }
        } while (rows.next());
        return Optional.of(new CardBatch(deck, progress, cards, Set.copyOf(due)));
    }
}
