package com.revue.reviews.application;

import com.revue.reviews.domain.AttemptMode;
import com.revue.reviews.domain.ReviewRating;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Persistence port for bounded queues and immutable rating results. */
public interface ReviewStore {
    int DAILY_NEW_CARD_LIMIT = 10;

    /** Exact original inputs, used for idempotent replay. */
    record Rating(
        ReviewRating rating,
        AttemptMode attemptMode,
        UUID requestId,
        long expectedVersion,
        int contentVersion) {
        /** Throws {@link ReviewProblem} for a rating or attempt mode outside the supported values. */
        public static Rating parse(
            @Nullable String rating,
            @Nullable String attemptMode,
            UUID requestId,
            long expectedVersion,
            int contentVersion) {
            return new Rating(
                supported(ReviewRating.class, rating),
                supported(AttemptMode.class, attemptMode),
                requestId,
                expectedVersion,
                contentVersion);
        }

        private static <E extends Enum<E>> E supported(Class<E> type, @Nullable String name) {
            if (name == null) {
                throw new ReviewProblem(ReviewProblem.Kind.INVALID_RATING);
            }
            try {
                return Enum.valueOf(type, name);
            } catch (IllegalArgumentException _) {
                throw new ReviewProblem(ReviewProblem.Kind.INVALID_RATING);
            }
        }
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

    /** Current state of a card the learner may study: one in a saved set or in the learner's own deck. */
    record Schedule(String schedulerId, String state, long version, @Nullable LocalDate due) {
    }

    /**
     * Bounded study projection, including the displayed text version. {@code setTitle} is the title of the saved set
     * or personal deck. A personal card has no publisher.
     *
     * <p>{@code keyIdeas} is always empty, because cards no longer have key ideas. The previous frontend reads the list
     * without checking for it, so it stays until no open tab can run that frontend; remove it in the next release.
     */
    record Card(
        String id,
        String question,
        String answer,
        @Nullable String explanation,
        @Nullable String memoryHook,
        @Nullable String source,
        List<String> keyIdeas,
        String setTitle,
        @Nullable String publisherName,
        int contentVersion,
        long version) {
    }

    /** One owned deck or saved set with at least one scheduled card due. */
    record Topic(String id, String title, long dueCards) {
    }

    /** One Manila calendar day with or without a saved review. */
    record StudyDay(LocalDate date, boolean studied) {
    }

    /** Remaining work in a paused topic, including fresh cards deferred by the daily limit. */
    record Continuation(@Nullable String topicTitle, long dueCards, long newCards, long unintroducedCards) {
    }

    /** One calculation supplies both Today and the next batch. */
    record Queue(
        long totalCards,
        long availableCards,
        long dueCards,
        long newCards,
        @Nullable LocalDate nextReviewDate,
        List<Card> cards,
        List<Topic> topics,
        List<StudyDay> studyDays,
        @Nullable String topicTitle,
        long unintroducedCards,
        @Nullable Continuation continuation) {
    }

    /** The projected queue and whether it includes new cards that still need stored schedules. */
    record QueueRead(Queue queue, boolean missingSchedules) {
    }

    /** Replay and scheduling facts from the same snapshot under the learner lock. */
    record RatingState(@Nullable Logged previous, @Nullable Schedule schedule, int introduced) {
    }

    /** Adds only missing initial schedules for cards in saved sets and in the learner's own decks. */
    void initialize(UUID learner, String profile, String initialState, @Nullable String topic);

    /** Counts and reads one bounded batch from the same database snapshot. */
    QueueRead queue(
        UUID learner,
        LocalDate today,
        int limit,
        @Nullable String topic,
        boolean includeNew,
        @Nullable String pausedTopic);

    /** Reads an original request without requiring current content access. */
    Optional<Logged> logged(UUID learner, UUID requestId);

    RatingState ratingState(UUID learner, long cardId, UUID requestId, LocalDate today);

    /** Reads the studied card and holds its text until the rating commits, so an edit lands before or after it. */
    Optional<Card> lockStudyCard(UUID learner, long cardId);

    /** Inserts once without aborting a transaction on a duplicate request. */
    boolean insert(UUID learner, Rating input, Result result, LocalDate day, String profile);

    /** Changes exactly the expected schedule, returning false on a conflict. */
    boolean advance(UUID learner, Rating input, Result result, String state);

    /** Emits a new saved event only after the enclosing transaction commits. */
    void saved(UUID learner, Rating input, Result result);
}
