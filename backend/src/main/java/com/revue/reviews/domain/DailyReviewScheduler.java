package com.revue.reviews.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Daily scheduling policy. This existing profile deliberately has no short-term steps. */
public final class DailyReviewScheduler {
    public static final String PROFILE = "fsrs6-java1.0.0-daily-v1";
    private final MemoryModel model;

    /** Creates the daily scheduler using its memory-model port. */
    public DailyReviewScheduler(MemoryModel model) {
        this.model = model;
    }

    /** Serialized memory state and the learner's next local review date. */
    public record Recommendation(String stateJson, LocalDate reviewDate) {
    }

    /** Schedules the first rating using the learner's local calendar date. */
    public Recommendation firstReview(int modelCardId, ReviewRating rating, Instant reviewedAt, ZoneId studentZone) {
        return recommendation(model.firstReview(modelCardId, rating, modelTime(reviewedAt, studentZone)));
    }

    /** Schedules a later rating from serialized memory state using the local calendar date. */
    public Recommendation nextReview(String stateJson, ReviewRating rating, Instant reviewedAt, ZoneId studentZone) {
        return recommendation(model.nextReview(stateJson, rating, modelTime(reviewedAt, studentZone)));
    }

    private static Instant modelTime(Instant reviewedAt, ZoneId zone) {
        return reviewedAt.atZone(zone).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    private static Recommendation recommendation(MemoryModel.Prediction prediction) {
        return new Recommendation(prediction.stateJson(), prediction.due().atZone(ZoneOffset.UTC).toLocalDate());
    }
}
