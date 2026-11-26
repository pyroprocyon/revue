package com.revue.reviews.application;

import com.revue.reviews.domain.CardText;
import com.revue.reviews.domain.DeckTitle;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Persistence port for personal decks. Every operation reaches only the given owner's rows. */
public interface DeckStore {
    /** A deck as its owner sees it in Library. */
    record Deck(String id, String title, long cardCount, boolean archived) {
    }

    /** A personal card with the text version that reviews record. */
    record Card(
        String id,
        String question,
        String answer,
        @Nullable String explanation,
        @Nullable String memoryHook,
        @Nullable String source,
        int contentVersion) {
    }

    /** Which cards a page reads: those after a card that match the search, optionally only the due ones. */
    record CardQuery(long afterCardId, int limit, String search, boolean dueOnly, LocalDate today) {
    }

    /**
     * The owner's review state for the deck. A paused deck has no due or new cards and no next date. New cards left
     * today is the owner's daily allowance, shared by all their decks and sets.
     */
    record Progress(long dueCards, long newCards, long newCardsLeftToday, @Nullable LocalDate nextReviewDate) {
    }

    /** Deck metadata, review state and a bounded batch from the same read, with the batch's due cards. */
    record CardBatch(Deck deck, Progress progress, List<Card> items, Set<String> dueCardIds) {
        public CardBatch {
            items = List.copyOf(items);
            dueCardIds = Set.copyOf(dueCardIds);
        }
    }

    /** The result of one confirmed import, as first saved. A retry returns the same count. */
    record CardImport(String deckId, int importedCards) {
    }

    /** The schedule every imported card starts with, before its first review. */
    record InitialSchedule(String schedulerId, String state) {
    }

    long countDecks(UUID owner);

    long countCards(UUID owner);

    Optional<Deck> replayDeck(UUID owner, UUID requestId, DeckTitle title);

    Optional<Card> replayCard(UUID owner, UUID requestId, long deckId, CardText text);

    /**
     * Returns the saved result of an earlier import with this request ID. Throws a create conflict when that import
     * went to another deck or had other cards.
     */
    Optional<CardImport> replayImport(UUID owner, UUID requestId, long deckId, List<CardText> cards);

    void setArchived(UUID owner, long deckId, boolean archived);

    Deck createDeck(UUID owner, DeckTitle title, @Nullable UUID requestId);

    /** Lists every deck the owner has, oldest first. */
    List<Deck> decks(UUID owner);

    boolean ownsDeck(UUID owner, long deckId);

    /** Returns empty when the owner has no such deck. */
    Optional<Deck> renameDeck(UUID owner, long deckId, DeckTitle title);

    /** Deletes the deck with its cards, their schedules and review logs. False when the owner has no such deck. */
    boolean deleteDeck(UUID owner, long deckId);

    /** Adds the card after the deck's existing cards. The caller has confirmed that the owner has this deck. */
    Card addCard(UUID owner, long deckId, CardText text, @Nullable UUID requestId);

    /**
     * Adds the cards after the deck's existing cards, in the given order, each with its initial schedule. The caller
     * has confirmed that the owner has this deck and room for the cards.
     */
    CardImport importCards(UUID owner, long deckId, List<CardText> cards, UUID requestId, InitialSchedule schedule);

    /** Reads one page in the order the cards were added. Empty when the owner has no such deck. */
    Optional<CardBatch> cardBatch(UUID owner, long deckId, CardQuery query);

    /** Replaces the card's text and raises its content version. Empty when the owner has no such card. */
    Optional<Card> editCard(UUID owner, long cardId, CardText text, @Nullable Integer expectedVersion);

    /** Deletes the card with its schedule and review logs. False when the owner has no such card. */
    boolean deleteCard(UUID owner, long cardId);
}
