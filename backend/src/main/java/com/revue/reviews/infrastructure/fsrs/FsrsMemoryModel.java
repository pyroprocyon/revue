package com.revue.reviews.infrastructure.fsrs;

import com.revue.reviews.domain.MemoryModel;
import com.revue.reviews.domain.ReviewRating;
import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import java.time.Duration;
import java.time.Instant;

/** FSRS-6 implementation of the existing daily-v1 profile. */
public final class FsrsMemoryModel implements MemoryModel {
    private final Scheduler scheduler;

    /** Creates the FSRS adapter with the configured interval-fuzzing choice. */
    public FsrsMemoryModel(boolean fuzzIntervals) {
        scheduler = Scheduler.builder()
            .desiredRetention(0.9)
            .learningSteps(new Duration[0])
            .relearningSteps(new Duration[0])
            .maximumInterval(36500)
            .enableFuzzing(fuzzIntervals)
            .build();
    }

    @Override
    public Prediction firstReview(int cardId, ReviewRating rating, Instant modelTime) {
        return review(Card.builder().cardId(cardId).build(), rating, modelTime);
    }

    @Override
    public Prediction nextReview(String stateJson, ReviewRating rating, Instant modelTime) {
        return review(Card.fromJson(stateJson), rating, modelTime);
    }

    private Prediction review(Card card, ReviewRating rating, Instant modelTime) {
        Rating modelRating = switch (rating) {
            case AGAIN -> Rating.AGAIN;
            case HARD -> Rating.HARD;
            case GOOD -> Rating.GOOD;
            case EASY -> Rating.EASY;
        };
        Card updated = scheduler.reviewCard(card, modelRating, modelTime).card();
        return new Prediction(updated.toJson(), updated.getDue());
    }
}
