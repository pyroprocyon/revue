package com.revue.reviews.application;

import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Explicit membership changes and bounded reads of the current learner's shared sets. */
@Service
@Transactional
public class LibraryService {
    private final LearnerAccess learners;
    private final LibraryStore store;
    private final MemoryModel memory;

    /** Wires the session boundary, library store and scheduler's initial state. */
    public LibraryService(LearnerAccess learners, LibraryStore store, MemoryModel memory) {
        this.learners = learners;
        this.store = store;
        this.memory = memory;
    }

    /** A bounded page with an opaque-to-the-client continuation value. */
    public record Page(List<LibraryStore.SavedSet> items, @Nullable String nextCursor) {
    }

    /** Saves once under the learner's lock; retries return the existing membership. */
    public LibraryStore.SavedSet save(long setId) {
        return store.save(learners.lockCurrent(), setId, DailyReviewScheduler.PROFILE, memory.initialState());
    }

    /** Shares the save lock so removal and saving cannot interleave for this learner. */
    public void remove(long setId) {
        store.remove(learners.lockCurrent(), setId);
    }

    /** Reads membership for the session's learner. */
    public boolean saved(long setId) {
        return store.contains(learners.lockCurrent(), setId);
    }

    /** Lists saved sets in stable ID order, without loading the entire library. */
    public Page list(long after, int limit) {
        if (after < 0 || limit < 1 || limit > 100) {
            throw new LibraryProblem(LibraryProblem.Kind.INVALID_PAGE);
        }
        var rows = store.list(learners.lockCurrent(), after, limit + 1);
        boolean more = rows.size() > limit;
        var items = List.copyOf(rows.subList(0, Math.min(rows.size(), limit)));
        return new Page(items, more ? items.getLast().id() : null);
    }
}
