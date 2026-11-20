package com.revue.reviews.application;

import com.revue.reviews.domain.CardText;
import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.DeckTitle;
import com.revue.reviews.domain.MemoryModel;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A learner's private decks and cards. Each change runs under the learner's lock, like saving and reviewing. */
@Service
@Transactional
public class DeckService {
    public static final int MAX_DECKS_PER_LEARNER = 50;
    public static final int MAX_CARDS_PER_LEARNER = 5000;
    public static final int MAX_CARDS_PER_IMPORT = 200;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_SEARCH_LENGTH = 200;
    private final LearnerAccess learners;
    private final DeckStore store;
    private final Clock clock;
    private final MemoryModel memory;

    public DeckService(LearnerAccess learners, DeckStore store, Clock clock, MemoryModel memory) {
        this.learners = learners;
        this.store = store;
        this.clock = clock;
        this.memory = memory;
    }

    /** A deck title as the learner typed it, before it is checked. */
    public record DeckDraft(@Nullable String title) {
    }

    /** Card text as the learner typed it, before it is checked. */
    public record CardDraft(
        @Nullable String question,
        @Nullable String answer,
        @Nullable String explanation,
        @Nullable String memoryHook,
        @Nullable String source) {
    }

    /** The cards a learner confirmed in a paste preview, in the order they appear there. */
    public record ImportDraft(@Nullable List<CardDraft> cards) {
    }

    /** One deck with a bounded page of its cards and the cursor for the next page. */
    public record CardPage(
        DeckStore.Deck deck,
        DeckStore.Progress progress,
        List<DeckStore.Card> items,
        List<String> dueCardIds,
        @Nullable String nextCursor) {
    }

    public DeckStore.Deck createDeck(DeckDraft draft, @Nullable UUID requestId) {
        DeckTitle title = checkedTitle(draft);
        UUID learner = learners.lockCurrent();
        if (requestId != null) {
            var replay = store.replayDeck(learner, requestId, title);
            if (replay.isPresent()) {
                return replay.get();
            }
        }
        if (store.countDecks(learner) >= MAX_DECKS_PER_LEARNER) {
            throw new DeckProblem(DeckProblem.Kind.DECK_LIMIT);
        }
        return store.createDeck(learner, title, requestId);
    }

    public List<DeckStore.Deck> decks() {
        return store.decks(learners.current());
    }

    public DeckStore.Deck renameDeck(long deckId, DeckDraft draft) {
        DeckTitle title = checkedTitle(draft);
        return store.renameDeck(learners.lockCurrent(), deckId, title).orElseThrow(DeckService::notFound);
    }

    public void setArchived(long deckId, boolean archived) {
        store.setArchived(learners.lockCurrent(), deckId, archived);
    }

    /** Deletes the deck together with its cards and the learner's review history of them. */
    public void deleteDeck(long deckId) {
        if (!store.deleteDeck(learners.lockCurrent(), deckId)) {
            throw notFound();
        }
    }

    /** Reads the deck and the cards that follow the given card, in the order they were added. */
    public CardPage cards(long deckId, long afterCardId, int limit, String search, boolean dueOnly) {
        String term = search.strip();
        if (afterCardId < 0
            || limit < 1
            || limit > MAX_PAGE_SIZE
            || term.length() > MAX_SEARCH_LENGTH
            || term.indexOf('\0') >= 0) {
            throw new DeckProblem(DeckProblem.Kind.INVALID_PAGE);
        }
        UUID learner = learners.current();
        var query = new DeckStore.CardQuery(
            afterCardId,
            limit + 1,
            term,
            dueOnly,
            DailyReviewScheduler.studyDate(clock.instant()));
        DeckStore.CardBatch batch = store.cardBatch(learner, deckId, query).orElseThrow(DeckService::notFound);
        List<DeckStore.Card> found = batch.items();
        boolean hasNextPage = found.size() > limit;
        List<DeckStore.Card> items = List.copyOf(found.subList(0, Math.min(found.size(), limit)));
        List<String> due = items.stream().map(DeckStore.Card::id).filter(batch.dueCardIds()::contains).toList();
        return new CardPage(batch.deck(), batch.progress(), items, due, hasNextPage ? items.getLast().id() : null);
    }

    public DeckStore.Card addCard(long deckId, CardDraft draft, @Nullable UUID requestId) {
        CardText text = checkedText(draft);
        UUID learner = learners.lockCurrent();
        if (!store.ownsDeck(learner, deckId)) {
            throw notFound();
        }
        if (requestId != null) {
            var replay = store.replayCard(learner, requestId, deckId, text);
            if (replay.isPresent()) {
                return replay.get();
            }
        }
        requireRoomFor(learner, 1);
        return store.addCard(learner, deckId, text, requestId);
    }

    /**
     * Saves every confirmed card with its initial schedule, or none of them. An exact retry returns the first result,
     * even after that import filled the account.
     */
    public DeckStore.CardImport importCards(long deckId, ImportDraft draft, UUID requestId) {
        List<CardText> cards = checkedImport(draft);
        UUID learner = learners.lockCurrent();
        if (!store.ownsDeck(learner, deckId)) {
            throw notFound();
        }
        var replay = store.replayImport(learner, requestId, deckId, cards);
        if (replay.isPresent()) {
            return replay.get();
        }
        requireRoomFor(learner, cards.size());
        var schedule = new DeckStore.InitialSchedule(DailyReviewScheduler.PROFILE, memory.initialState());
        return store.importCards(learner, deckId, cards, requestId, schedule);
    }

    /** Replaces the card's text. The learner's schedule for the card is unchanged. */
    public DeckStore.Card editCard(long cardId, CardDraft draft, @Nullable Integer expectedVersion) {
        CardText text = checkedText(draft);
        return store.editCard(learners.lockCurrent(), cardId, text, expectedVersion).orElseThrow(DeckService::notFound);
    }

    /** Deletes the card together with the learner's schedule and review history of it. */
    public void deleteCard(long cardId) {
        if (!store.deleteCard(learners.lockCurrent(), cardId)) {
            throw notFound();
        }
    }

    private void requireRoomFor(UUID learner, int newCards) {
        long availableCards = Math.max(0, MAX_CARDS_PER_LEARNER - store.countCards(learner));
        if (newCards > availableCards) {
            throw DeckProblem.cardLimit(availableCards);
        }
    }

    private static List<CardText> checkedImport(ImportDraft draft) {
        List<CardDraft> drafts = draft.cards();
        if (drafts == null || drafts.isEmpty() || drafts.size() > MAX_CARDS_PER_IMPORT) {
            throw new DeckProblem(DeckProblem.Kind.INVALID_TEXT);
        }
        List<CardText> cards = new ArrayList<>(drafts.size());
        for (CardDraft card : drafts) {
            if (card == null) {
                throw new DeckProblem(DeckProblem.Kind.INVALID_TEXT);
            }
            cards.add(checkedText(card));
        }
        return cards;
    }

    private static DeckTitle checkedTitle(DeckDraft draft) {
        try {
            return new DeckTitle(draft.title());
        } catch (IllegalArgumentException invalid) {
            throw new DeckProblem(DeckProblem.Kind.INVALID_TEXT, invalid);
        }
    }

    private static CardText checkedText(CardDraft draft) {
        try {
            return new CardText(
                draft.question(),
                draft.answer(),
                draft.explanation(),
                draft.memoryHook(),
                draft.source());
        } catch (IllegalArgumentException invalid) {
            throw new DeckProblem(DeckProblem.Kind.INVALID_TEXT, invalid);
        }
    }

    private static DeckProblem notFound() {
        return new DeckProblem(DeckProblem.Kind.NOT_FOUND);
    }
}
