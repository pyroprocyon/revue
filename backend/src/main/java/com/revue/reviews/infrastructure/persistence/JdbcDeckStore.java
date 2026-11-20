package com.revue.reviews.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.reviews.application.DeckProblem;
import com.revue.reviews.application.DeckStore;
import com.revue.reviews.domain.CardText;
import com.revue.reviews.domain.DeckTitle;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
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

/** PostgreSQL personal decks and cards. The service's learner lock serializes one owner's changes. */
@Repository
public class JdbcDeckStore implements DeckStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcDeckStore.class);
    private static final String ARCHIVED = "archived";
    private static final String ABSENT = "absent";
    private static final String PRESENT = "present";
    private static final String OWNED_CARDS = """
        select c.id, c.question, c.answer, c.explanation, c.memory_hook, c.source, c.content_version
        from cards c join decks d on d.id = c.deck_id
        where d.owner_id = ?
        """;
    private static final String CARDS_OF_DECK = "select id from cards where deck_id = ?";
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final JdbcCardBrowser browser;

    public JdbcDeckStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.browser = new JdbcCardBrowser(jdbc);
    }

    @Override
    public void setArchived(UUID owner, long deckId, boolean archived) {
        int changed = jdbc.update("""
            update decks set archived = ?, updated_at = clock_timestamp()
            where owner_id = ? and id = ? and archived <> ?
            """, archived, owner, deckId, archived);
        if (changed == 1) {
            logAfterCommit(
                archived ? "deck.archived" : "deck.restored",
                "deck",
                Long.toString(deckId),
                owner,
                archived ? "active" : ARCHIVED,
                archived ? ARCHIVED : "active");
        } else if (!ownsDeck(owner, deckId)) {
            throw new DeckProblem(DeckProblem.Kind.NOT_FOUND);
        }
    }

    private void recordCreation(
        UUID owner,
        @Nullable UUID requestId,
        @Nullable Long parentId,
        String createdId,
        String[] fields) {
        if (requestId != null) {
            jdbc.update("""
                insert into deck_creation_requests(owner_id, request_id, parent_deck_id, created_id, request_hash)
                values (?, ?, ?, ?, sha256(array_send(?::text[])))
                """, owner, requestId, parentId, Long.parseLong(createdId), fields);
        }
    }

    @Override
    public Optional<Deck> replayDeck(UUID owner, UUID requestId, DeckTitle title) {
        return jdbc.query("""
            select d.id, d.title, d.archived, (select count(*) from cards where deck_id = d.id) as card_count,
                r.request_hash = sha256(array_send(?::text[])) as matches_request
            from deck_creation_requests r left join decks d
            on r.parent_deck_id is null and d.id = r.created_id and d.owner_id = r.owner_id
            where r.owner_id = ? and r.request_id = ?
            """, (row, index) -> toDeck(matchingCreation(row), index), new String[] {title.value()}, owner, requestId)
            .stream()
            .findFirst();
    }

    @Override
    public Optional<Card> replayCard(UUID owner, UUID requestId, long deckId, CardText text) {
        return jdbc.query("""
            select c.id, c.question, c.answer, c.explanation, c.memory_hook, c.source, c.content_version,
                r.request_hash = sha256(array_send(?::text[])) as matches_request
            from deck_creation_requests r left join cards c
            on c.deck_id = r.parent_deck_id and c.deck_id = ? and c.id = r.created_id
            where r.owner_id = ? and r.request_id = ?
            """, (row, index) -> toCard(matchingCreation(row), index), creationFields(text), deckId, owner, requestId)
            .stream()
            .findFirst();
    }

    @Override
    public Optional<CardImport> replayImport(UUID owner, UUID requestId, long deckId, List<CardText> cards) {
        return jdbc.query("""
            select deck_id, imported_cards,
                deck_id = ? and request_hash = sha256(array_send(?::text[])) as matches_request
            from deck_import_requests
            where owner_id = ? and request_id = ?
            """, JdbcDeckStore::toMatchingImport, deckId, importFields(cards), owner, requestId).stream().findFirst();
    }

    private static CardImport toMatchingImport(ResultSet row, int index) throws SQLException {
        if (!row.getBoolean("matches_request")) {
            throw new DeckProblem(DeckProblem.Kind.CREATE_CONFLICT);
        }
        return new CardImport(row.getString("deck_id"), row.getInt("imported_cards"));
    }

    private static String[] importFields(List<CardText> cards) {
        return cards.stream().flatMap(card -> Arrays.stream(creationFields(card))).toArray(String[]::new);
    }

    private static ResultSet matchingCreation(ResultSet row) throws SQLException {
        if (row.getObject("id") == null || !row.getBoolean("matches_request")) {
            throw new DeckProblem(DeckProblem.Kind.CREATE_CONFLICT);
        }
        return row;
    }

    private static String[] creationFields(CardText text) {
        return new String[] {text.question(), text.answer(), text.explanation(), text.memoryHook(), text.source()};
    }

    @Override
    public long countDecks(UUID owner) {
        return jdbc.queryForObject("select count(*) from decks where owner_id = ?", Long.class, owner);
    }

    @Override
    public long countCards(UUID owner) {
        return jdbc.queryForObject("""
            select count(*) from cards c join decks d on d.id = c.deck_id where d.owner_id = ?
            """, Long.class, owner);
    }

    @Override
    public Deck createDeck(UUID owner, DeckTitle title, @Nullable UUID requestId) {
        Deck created = jdbc.queryForObject("""
            insert into decks(owner_id, title, created_at, updated_at)
            values (?, ?, clock_timestamp(), clock_timestamp())
            returning id, title, archived, 0 as card_count
            """, JdbcDeckStore::toDeck, owner, title.value());
        recordCreation(owner, requestId, null, created.id(), new String[] {title.value()});
        logAfterCommit("deck.created", "deck", created.id(), owner, ABSENT, PRESENT);
        return created;
    }

    @Override
    public List<Deck> decks(UUID owner) {
        return jdbc.query("""
            select d.id, d.title, d.archived, count(c.id) as card_count
            from decks d left join cards c on c.deck_id = d.id
            where d.owner_id = ?
            group by d.id
            order by d.id
            """, JdbcDeckStore::toDeck, owner);
    }

    @Override
    public boolean ownsDeck(UUID owner, long deckId) {
        return Boolean.TRUE.equals(
            jdbc.queryForObject(
                "select exists (select 1 from decks where owner_id = ? and id = ?)",
                Boolean.class,
                owner,
                deckId));
    }

    @Override
    public Optional<Deck> renameDeck(UUID owner, long deckId, DeckTitle title) {
        return jdbc.query("""
            update decks d set title = ?, updated_at = clock_timestamp() where d.owner_id = ? and d.id = ?
            returning d.id, d.title, d.archived, (select count(*) from cards where deck_id = d.id) as card_count
            """, JdbcDeckStore::toDeck, title.value(), owner, deckId).stream().findFirst();
    }

    @Override
    public boolean deleteDeck(UUID owner, long deckId) {
        if (!ownsDeck(owner, deckId)) {
            return false;
        }
        deleteDeckCardsWithHistory(deckId);
        jdbc.update("delete from decks where id = ?", deckId);
        logAfterCommit("deck.deleted", "deck", Long.toString(deckId), owner, PRESENT, ABSENT);
        return true;
    }

    @Override
    public Card addCard(UUID owner, long deckId, CardText text, @Nullable UUID requestId) {
        Card added = jdbc.queryForObject(
            """
                insert into cards(deck_id, position, question, answer, explanation, memory_hook, source, created_at,
                    updated_at)
                values (?, (select coalesce(max(position) + 1, 0) from cards where deck_id = ?), ?, ?, ?, ?, ?,
                    clock_timestamp(), clock_timestamp())
                returning id, question, answer, explanation, memory_hook, source, content_version
                """,
            JdbcDeckStore::toCard,
            deckId,
            deckId,
            text.question(),
            text.answer(),
            text.explanation(),
            text.memoryHook(),
            text.source());
        recordCreation(owner, requestId, deckId, added.id(), creationFields(text));
        logAfterCommit("card.created", "card", added.id(), owner, ABSENT, PRESENT);
        return added;
    }

    @Override
    public CardImport importCards(
        UUID owner,
        long deckId,
        List<CardText> cards,
        UUID requestId,
        InitialSchedule schedule) {
        var parameters = new MapSqlParameterSource().addValue("owner", owner)
            .addValue("deck", deckId)
            .addValue("questions", cards.stream().map(CardText::question).toArray(String[]::new))
            .addValue("answers", cards.stream().map(CardText::answer).toArray(String[]::new))
            .addValue("explanations", cards.stream().map(CardText::explanation).toArray(String[]::new))
            .addValue("memoryHooks", cards.stream().map(CardText::memoryHook).toArray(String[]::new))
            .addValue("sources", cards.stream().map(CardText::source).toArray(String[]::new))
            .addValue("schedulerId", schedule.schedulerId())
            .addValue("initialState", schedule.state());
        DeckGrowth growth = named.queryForObject("""
            with pasted as (
                select *
                from unnest(cast(:questions as text[]), cast(:answers as text[]), cast(:explanations as text[]),
                    cast(:memoryHooks as text[]), cast(:sources as text[]))
                    with ordinality as item(question, answer, explanation, memory_hook, source, place)
            ), deck_before as (
                select count(*) as cards, coalesce(max(position) + 1, 0) as next_position
                from cards where deck_id = :deck
            ), added as (
                insert into cards(deck_id, position, question, answer, explanation, memory_hook, source, created_at,
                    updated_at)
                select :deck, deck_before.next_position + pasted.place - 1, pasted.question, pasted.answer,
                    pasted.explanation, pasted.memory_hook, pasted.source, clock_timestamp(), clock_timestamp()
                from pasted cross join deck_before
                order by pasted.place
                returning id
            ), scheduled as (
                insert into schedules(user_id, card_id, scheduler_id, scheduler_state)
                select :owner, id, :schedulerId, cast(:initialState as jsonb) from added
                returning card_id
            )
            select (select cards from deck_before) as cards_before, (select count(*) from scheduled) as imported
            """, parameters, (row, index) -> new DeckGrowth(row.getLong("cards_before"), row.getInt("imported")));
        jdbc.update("""
            insert into deck_import_requests(owner_id, request_id, deck_id, request_hash, imported_cards)
            values (?, ?, ?, sha256(array_send(?::text[])), ?)
            """, owner, requestId, deckId, importFields(cards), growth.imported());
        logAfterCommit(
            "deck.cards_imported",
            "deck",
            Long.toString(deckId),
            owner,
            growth.cardsBefore(),
            growth.cardsBefore() + growth.imported());
        return new CardImport(Long.toString(deckId), growth.imported());
    }

    private record DeckGrowth(long cardsBefore, int imported) {
    }

    @Override
    public Optional<CardBatch> cardBatch(UUID owner, long deckId, CardQuery query) {
        return browser.deck(owner, deckId, query);
    }

    @Override
    public Optional<Card> editCard(UUID owner, long cardId, CardText text, @Nullable Integer expectedVersion) {
        Optional<Card> current = ownedCard(owner, cardId);
        if (current.isEmpty() || hasText(current.get(), text)) {
            return current;
        }
        if (!Objects.equals(expectedVersion, current.get().contentVersion())) {
            throw new DeckProblem(DeckProblem.Kind.STALE_CARD);
        }
        if (text.answer().length() > CardText.MAX_ANSWER && !text.answer().equals(current.get().answer())) {
            throw new DeckProblem(DeckProblem.Kind.INVALID_TEXT);
        }
        Card edited = jdbc.queryForObject(
            """
                update cards set question = ?, answer = ?, explanation = ?, memory_hook = ?, source = ?,
                    content_version = content_version + 1, updated_at = clock_timestamp()
                where id = ?
                returning id, question, answer, explanation, memory_hook, source, content_version
                """,
            JdbcDeckStore::toCard,
            text.question(),
            text.answer(),
            text.explanation(),
            text.memoryHook(),
            text.source(),
            cardId);
        logAfterCommit(
            "card.edited",
            "card",
            edited.id(),
            owner,
            current.get().contentVersion(),
            edited.contentVersion());
        return Optional.of(edited);
    }

    @Override
    public boolean deleteCard(UUID owner, long cardId) {
        boolean owned = Boolean.TRUE.equals(jdbc.queryForObject("""
            select exists (select 1 from cards c join decks d on d.id = c.deck_id where d.owner_id = ? and c.id = ?)
            """, Boolean.class, owner, cardId));
        if (!owned) {
            return false;
        }
        jdbc.update("delete from review_logs where card_id = ?", cardId);
        jdbc.update("delete from schedules where card_id = ?", cardId);
        jdbc.update("delete from cards where id = ?", cardId);
        logAfterCommit("card.deleted", "card", Long.toString(cardId), owner, PRESENT, ABSENT);
        return true;
    }

    private Optional<Card> ownedCard(UUID owner, long cardId) {
        return jdbc.query(OWNED_CARDS + " and c.id = ?", JdbcDeckStore::toCard, owner, cardId).stream().findFirst();
    }

    private static boolean hasText(Card card, CardText text) {
        return card.question().equals(text.question())
            && card.answer().equals(text.answer())
            && Objects.equals(card.explanation(), text.explanation())
            && Objects.equals(card.memoryHook(), text.memoryHook())
            && Objects.equals(card.source(), text.source());
    }

    /** Schedules and review logs refer to their card, so they are deleted before it. */
    private void deleteDeckCardsWithHistory(long deckId) {
        jdbc.update("delete from review_logs where card_id in (" + CARDS_OF_DECK + ")", deckId);
        jdbc.update("delete from schedules where card_id in (" + CARDS_OF_DECK + ")", deckId);
        jdbc.update("delete from cards where deck_id = ?", deckId);
    }

    private static void logAfterCommit(
        String eventName,
        String entityType,
        String entityId,
        UUID owner,
        Object stateFrom,
        Object stateTo) {
        AfterCommit.log(() -> {
            var event = LOG.atInfo();
            // HTTP requests already carry operation.id in MDC; ECS rejects duplicate nested fields.
            if (MDC.get("operation.id") == null) {
                event.addKeyValue("operation.id", UUID.randomUUID());
            }
            event.addKeyValue("event.name", eventName)
                .addKeyValue("event.outcome", "success")
                .addKeyValue("entity.type", entityType)
                .addKeyValue("entity.id", entityId)
                .addKeyValue("actor.id", owner)
                .addKeyValue("state.from", stateFrom)
                .addKeyValue("state.to", stateTo)
                .log("Personal deck changed");
        });
    }

    private static Deck toDeck(ResultSet row, int index) throws SQLException {
        return new Deck(
            row.getString("id"),
            row.getString("title"),
            row.getLong("card_count"),
            row.getBoolean(ARCHIVED));
    }

    static Card toCard(ResultSet row, int index) throws SQLException {
        return new Card(
            row.getString("id"),
            row.getString("question"),
            row.getString("answer"),
            row.getString("explanation"),
            row.getString("memory_hook"),
            row.getString("source"),
            row.getInt("content_version"));
    }
}
