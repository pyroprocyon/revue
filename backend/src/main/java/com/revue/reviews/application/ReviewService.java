package com.revue.reviews.application;

import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import com.revue.reviews.domain.ReviewRating;
import java.time.Clock;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Daily reviews serialized per learner, with one atomic result and same-request replay. */
@Service
@Transactional
public class ReviewService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Manila");
    private final LearnerAccess learners;
    private final ReviewStore store;
    private final StudyDates studyDates;
    private final DailyReviewScheduler scheduler;
    private final MemoryModel memory;
    private final Clock clock;

    /** Wires the current-account boundary, persistence, scheduling and identity-owned dates. */
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

    /** Builds Today and at most five cards without consuming the daily allowance. */
    public ReviewStore.Queue queue(int limit) {
        if (limit < 1 || limit > 5) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_LIMIT);
        }
        UUID learner = learners.lockCurrent();
        var today = clock.instant().atZone(ZONE).toLocalDate();
        store.initialize(learner, DailyReviewScheduler.PROFILE, memory.initialState());
        return store.queue(learner, today, limit);
    }

    /** Saves one rating, or returns its original result without advancing again. */
    public ReviewStore.Result rate(long cardId, ReviewStore.Rating input) {
        validate(cardId, input);
        UUID learner = learners.lockCurrent();
        // PostgreSQL stores microseconds; normalize before building the first and replayed bodies.
        var reviewedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
        var today = reviewedAt.atZone(ZONE).toLocalDate();
        var previous = store.logged(learner, input.requestId());
        if (previous.isPresent()) {
            return replay(cardId, input, previous.get());
        }
        var state = store.schedule(learner, cardId)
            .orElseThrow(() -> new ReviewProblem(ReviewProblem.Kind.UNAVAILABLE));
        if (state.version() != input.expectedVersion()) {
            throw new ReviewProblem(ReviewProblem.Kind.STALE_SCHEDULE);
        }
        if (state.due() != null && state.due().isAfter(today)) {
            throw new ReviewProblem(ReviewProblem.Kind.NOT_DUE);
        }
        if (state.version() == 0 && store.introduced(learner, today) >= 10) {
            throw new ReviewProblem(ReviewProblem.Kind.DAILY_LIMIT);
        }
        if (!DailyReviewScheduler.PROFILE.equals(state.schedulerId())) {
            throw new ReviewProblem(ReviewProblem.Kind.UNSUPPORTED_SCHEDULER);
        }
        var prediction = scheduler.nextReview(state.state(), ReviewRating.valueOf(input.rating()), reviewedAt, ZONE);
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
            || !("ANSWERED".equals(input.attemptMode()) || "SHOWN".equals(input.attemptMode()))
            || !("AGAIN".equals(input.rating())
                || "HARD".equals(input.rating())
                || "GOOD".equals(input.rating())
                || "EASY".equals(input.rating()))
            || ("SHOWN".equals(input.attemptMode()) && !"AGAIN".equals(input.rating()))) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_RATING);
        }
    }
}
