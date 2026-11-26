package com.revue.reviews.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Membership changes share the learner lock. Reads return only the session learner's sets. */
public interface LibraryStore {
    /** Metadata for the saved-set list. */
    record SavedSet(
        String id,
        String setKey,
        String title,
        String description,
        String publisherName,
        long cardCount,
        boolean retired,
        boolean saveAllowed,
        boolean reviewsPaused,
        Instant savedAt) {
    }

    /** Counts across the learner's Library, independent of the page cursor and review filter. */
    record ReviewCounts(long active, long paused) {
    }

    /** Page rows and whole-library counts from the same database snapshot. */
    record SavedSetPage(List<SavedSet> items, ReviewCounts counts) {
        public SavedSetPage {
            items = List.copyOf(items);
        }
    }

    /** Saves an eligible active set and its initial schedules atomically, preserving existing progress. */
    SavedSet save(UUID learner, long setId, String schedulerId, String initialState, int limit);

    /** Removes only membership; schedules remain available when the learner saves again. */
    void remove(UUID learner, long setId);

    void setReviewsPaused(UUID learner, long setId, boolean paused);

    /** Reads one learner's bounded page, including retired publications. */
    SavedSetPage list(UUID learner, long after, int limit, @Nullable Boolean paused);

    List<String> savedKeys(UUID learner);

    Optional<SavedSet> find(UUID learner, long setId);

    Optional<DeckStore.CardBatch> cardBatch(UUID learner, long setId, DeckStore.CardQuery query);

    /** Reads membership without altering schedules. */
    boolean contains(UUID learner, long setId);
}
