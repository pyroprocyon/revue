package com.revue.reviews.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Library persistence operations share the service transaction and learner lock. */
public interface LibraryStore {
    /** Metadata only; shared answers and other learners' progress never enter Library. */
    record SavedSet(
        String id,
        String setKey,
        String title,
        String description,
        String publisherName,
        long cardCount,
        boolean retired,
        boolean saveAllowed,
        Instant savedAt) {
    }

    /** Saves an eligible active set and its initial schedules atomically, preserving existing progress. */
    SavedSet save(UUID learner, long setId, String schedulerId, String initialState);

    /** Removes only membership; schedules remain available when the learner saves again. */
    void remove(UUID learner, long setId);

    /** Reads one learner's bounded page, including retired publications. */
    List<SavedSet> list(UUID learner, long after, int limit);

    /** Reads membership without altering schedules. */
    boolean contains(UUID learner, long setId);
}
