package com.revue.reviews.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Persistence port for bounded queues and immutable rating results. */
public interface ReviewStore {
    /** Exact original inputs, used for idempotent replay. */
    record Rating(String rating, String attemptMode, UUID requestId, long expectedVersion, int contentVersion) {
    }

    /** Response reconstructed exclusively from the committed log. */
    record Result(
        String cardId,
        UUID requestId,
        Instant reviewedAt,
        LocalDate recommendedReviewDate,
        LocalDate nextReviewDate,
        long scheduleVersion) {
    }

    /** Original input and immutable result of a rating. */
    record Logged(Rating input, Result result) {
    }

    /** Current state available to this learner through a saved membership. */
    record Schedule(String schedulerId, String state, long version, @Nullable LocalDate due) {
    }

    /** Bounded study projection, including the displayed text version. */
    record Card(
        String id,
        String question,
        String answer,
        @Nullable String explanation,
        @Nullable String memoryHook,
        String source,
        List<String> keyIdeas,
        String setTitle,
        String publisherName,
        int contentVersion,
        long version) {
    }

    /** One calculation supplies both Today and the next batch. */
    record Queue(
        long totalCards,
        long availableCards,
        long dueCards,
        long newCards,
        @Nullable LocalDate nextReviewDate,
        List<Card> cards) {
    }

    /** Adds only missing initial schedules for current memberships. */
    void initialize(UUID learner, String profile, String initialState);

    /** Counts and reads one bounded batch from the same database snapshot. */
    Queue queue(UUID learner, LocalDate today, int limit);

    /** Reads an original request without requiring current content access. */
    Optional<Logged> logged(UUID learner, UUID requestId);

    /** Reads only a currently accessible active card's schedule. */
    Optional<Schedule> schedule(UUID learner, long cardId);

    /** Counts first reviews independently of current membership. */
    int introduced(UUID learner, LocalDate today);

    /** Inserts once without aborting a transaction on a duplicate request. */
    boolean insert(UUID learner, Rating input, Result result, LocalDate day, String profile);

    /** Changes exactly the expected schedule, returning false on a conflict. */
    boolean advance(UUID learner, Rating input, Result result, String state);

    /** Emits a new saved event only after the enclosing transaction commits. */
    void saved(UUID learner, Rating input, Result result);
}
