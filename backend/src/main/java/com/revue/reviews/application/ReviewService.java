package com.revue.reviews.application;

import com.revue.reviews.domain.AttemptMode;
import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import com.revue.reviews.domain.ReviewRating;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Daily reviews serialized per learner, with one atomic result and same-request replay. */
@Service
@Transactional
public class ReviewService {
    private static final Pattern TOPIC_ID = Pattern.compile("(?:deck|set)-[1-9]\\d{0,18}");
    private final LearnerAccess learners;
    private final ReviewStore store;
    private final StudyDates studyDates;
    private final DailyReviewScheduler scheduler;
    private final MemoryModel memory;
    private final Clock clock;

    public ReviewService(
        LearnerAccess learners,
        ReviewStore store,
        StudyDates studyDates,
        DailyReviewScheduler scheduler,
        MemoryModel memory,
        Clock clock) {
        this.learners = learners;
        this.store = store;
        this.studyDates = studyDates;
        this.scheduler = scheduler;
        this.memory = memory;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public int dailyNewCardLimit() {
        return store.dailyNewCardLimit(learners.current());
    }

    public int setDailyNewCardLimit(int limit) {
        if (limit != ReviewStore.DEFAULT_DAILY_NEW_CARD_LIMIT && limit != ReviewStore.MAX_DAILY_NEW_CARD_LIMIT) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_NEW_CARD_LIMIT);
        }
        UUID learner = learners.lockCurrent();
        int previousLimit = store.dailyNewCardLimit(learner);
        if (limit != previousLimit) {
            store.saveDailyNewCardLimit(learner, previousLimit, limit);
        }
        return limit;
    }

    /** Builds Today and at most five cards without consuming the daily allowance. */
    public ReviewStore.Queue queue(
        int limit,
        @Nullable String topic,
        boolean includeNew,
        boolean summaryOnly,
        @Nullable String pausedTopic) {
        if (limit < 1 || limit > 5) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_LIMIT);
        }
        if ((topic != null && !TOPIC_ID.matcher(topic).matches())
            || (pausedTopic != null && (!summaryOnly || topic != null || !TOPIC_ID.matcher(pausedTopic).matches()))) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_TOPIC);
        }
        UUID learner = learners.current();
        var today = DailyReviewScheduler.studyDate(clock.instant());
        var result = store
            .queue(learner, today, summaryOnly ? 0 : limit, topic, topic == null || includeNew, pausedTopic);
        if (result.missingSchedules()) {
            store.initialize(learners.lockCurrent(), DailyReviewScheduler.PROFILE, memory.initialState(), topic);
        }
        return result.queue();
    }

    /** Saves one rating, or returns its original result without advancing again. */
    public ReviewStore.Result rate(long cardId, ReviewStore.Rating input) {
        validate(cardId, input);
        UUID learner = learners.lockCurrent();
        // PostgreSQL stores microseconds; normalize before building the first and replayed bodies.
        var reviewedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
        var today = DailyReviewScheduler.studyDate(reviewedAt);
        var facts = store.ratingState(learner, cardId, input.requestId(), today);
        if (facts.previous() != null) {
            return replay(cardId, input, facts.previous());
        }
        var state = facts.schedule();
        if (state == null) {
            throw new ReviewProblem(ReviewProblem.Kind.UNAVAILABLE);
        }
        if (state.version() != input.expectedVersion()) {
            throw new ReviewProblem(ReviewProblem.Kind.STALE_SCHEDULE);
        }
        if (state.due() != null && state.due().isAfter(today)) {
            throw new ReviewProblem(ReviewProblem.Kind.NOT_DUE);
        }
        if (state.version() == 0 && facts.newCardsLeft() == 0) {
            throw new ReviewProblem(ReviewProblem.Kind.DAILY_LIMIT);
        }
        if (!DailyReviewScheduler.PROFILE.equals(state.schedulerId())) {
            throw new ReviewProblem(ReviewProblem.Kind.UNSUPPORTED_SCHEDULER);
        }
        var current = store.lockStudyCard(learner, cardId)
            .orElseThrow(() -> new ReviewProblem(ReviewProblem.Kind.UNAVAILABLE));
        if (current.contentVersion() != input.contentVersion()) {
            throw ReviewProblem.contentChanged(current);
        }
        var prediction = scheduler
            .nextReview(state.state(), input.rating(), reviewedAt, DailyReviewScheduler.STUDENT_ZONE);
        var result = new ReviewStore.Result(
            Long.toString(cardId),
            input.requestId(),
            reviewedAt,
            prediction.reviewDate(),
            prediction.reviewDate(),
            state.version() + 1);
        if (!store.insert(learner, input, result, today, state.schedulerId())) {
            return replay(cardId, input, store.logged(learner, input.requestId()).orElseThrow());
        }
        if (!store.advance(learner, input, result, prediction.stateJson())) {
            throw new ReviewProblem(ReviewProblem.Kind.STALE_SCHEDULE);
        }
        studyDates.recordStudyDay(learner, today);
        store.saved(learner, input, result);
        return result;
    }

    private static ReviewStore.Result replay(long cardId, ReviewStore.Rating input, ReviewStore.Logged previous) {
        if (!previous.input().equals(input) || !previous.result().cardId().equals(Long.toString(cardId))) {
            throw new ReviewProblem(ReviewProblem.Kind.REQUEST_REUSED);
        }
        return previous.result();
    }

    private static void validate(long cardId, ReviewStore.Rating input) {
        if (cardId < 1
            || input.requestId() == null
            || input.expectedVersion() < 0
            || input.expectedVersion() == Long.MAX_VALUE
            || input.contentVersion() < 1
            || shownAnswerRatedAboveAgain(input)) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_RATING);
        }
    }

    private static boolean shownAnswerRatedAboveAgain(ReviewStore.Rating input) {
        return input.attemptMode() == AttemptMode.SHOWN && input.rating() != ReviewRating.AGAIN;
    }
}
