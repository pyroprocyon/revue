package com.revue.reviews.application;

import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import java.time.Clock;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Explicit membership changes and bounded reads of the current learner's shared sets. */
@Service
public class LibraryService {
    public static final int MAX_SAVED_SETS_PER_LEARNER = 50;

    private final LearnerAccess learners;
    private final LibraryStore store;
    private final MemoryModel memory;
    private final Clock clock;

    public LibraryService(LearnerAccess learners, LibraryStore store, MemoryModel memory, Clock clock) {
        this.learners = learners;
        this.store = store;
        this.memory = memory;
        this.clock = clock;
    }

    /** A bounded page with an opaque-to-the-client continuation value. */
    public record Page(
        List<LibraryStore.SavedSet> items,
        @Nullable String nextCursor,
        LibraryStore.ReviewCounts counts) {
    }

    /** Saves once under the learner's lock; retries return the existing membership. */
    @Transactional
    public LibraryStore.SavedSet save(long setId) {
        return store.save(
            learners.lockCurrent(),
            setId,
            DailyReviewScheduler.PROFILE,
            memory.initialState(),
            MAX_SAVED_SETS_PER_LEARNER);
    }

    /** Shares the save lock so removal and saving cannot interleave for this learner. */
    @Transactional
    public void remove(long setId) {
        store.remove(learners.lockCurrent(), setId);
    }

    @Transactional
    public void setReviewsPaused(long setId, boolean paused) {
        store.setReviewsPaused(learners.lockCurrent(), setId, paused);
    }

    /** Reads membership for the session's learner. */
    public boolean saved(long setId) {
        return store.contains(learners.current(), setId);
    }

    public LibraryStore.SavedSet detail(long setId) {
        return store.find(learners.current(), setId)
            .orElseThrow(() -> new LibraryProblem(LibraryProblem.Kind.UNAVAILABLE));
    }

    public List<String> savedKeys() {
        return store.savedKeys(learners.current());
    }

    public DeckService.CardPage cards(long setId, long after, int limit, String search, boolean dueOnly) {
        String term = search.strip();
        if (!DeckService.validCardPage(after, limit, term)) {
            throw new LibraryProblem(LibraryProblem.Kind.INVALID_PAGE);
        }
        var query = new DeckStore.CardQuery(
            after,
            limit + 1,
            term,
            dueOnly,
            DailyReviewScheduler.studyDate(clock.instant()));
        var batch = store.cardBatch(learners.current(), setId, query)
            .orElseThrow(() -> new LibraryProblem(LibraryProblem.Kind.UNAVAILABLE));
        return DeckService.cardPage(batch, limit);
    }

    /** Lists saved sets in stable ID order, without loading the entire library. */
    public Page list(long after, int limit, @Nullable Boolean paused) {
        if (after < 0 || limit < 1 || limit > 100) {
            throw new LibraryProblem(LibraryProblem.Kind.INVALID_PAGE);
        }
        var page = store.list(learners.current(), after, limit + 1, paused);
        var rows = page.items();
        boolean more = rows.size() > limit;
        var items = List.copyOf(rows.subList(0, Math.min(rows.size(), limit)));
        return new Page(items, more ? items.getLast().id() : null, page.counts());
    }
}
