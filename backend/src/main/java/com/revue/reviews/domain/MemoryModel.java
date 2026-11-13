package com.revue.reviews.domain;

import java.time.Instant;

/** An opaque model state keeps the scheduling domain independent of the FSRS library. */
public interface MemoryModel {
    /** Serialized memory state and the memory model's due instant. */
    record Prediction(String stateJson, Instant due) {
    }

    /** Serialized unreviewed state; no learner date or rating has been assigned. */
    String initialState();

    /** Computes the first memory prediction at the supplied model time. */
    Prediction firstReview(int cardId, ReviewRating rating, Instant modelTime);

    /** Computes a memory prediction from the previously serialized state. */
    Prediction nextReview(String stateJson, ReviewRating rating, Instant modelTime);
}
