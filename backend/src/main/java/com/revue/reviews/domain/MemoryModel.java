package com.revue.reviews.domain;

import java.time.Instant;

/** An opaque model state keeps the scheduling domain independent of the FSRS library. */
public interface MemoryModel {
	record Prediction(String stateJson, Instant due) {
	}
	Prediction firstReview(int cardId, ReviewRating rating, Instant modelTime);
	Prediction nextReview(String stateJson, ReviewRating rating, Instant modelTime);
}
