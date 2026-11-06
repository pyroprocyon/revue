package com.revue.reviews;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import org.springframework.stereotype.Component;

/** Computes the next daily review from a confirmed rating and server-owned FSRS state. */
@Component
public class DailyReviewScheduler {

	public static final String PROFILE = "fsrs6-java1.0.0-daily-v1";

	private final Scheduler scheduler;

	public DailyReviewScheduler() {
		this(true);
	}

	DailyReviewScheduler(boolean fuzzIntervals) {
		scheduler = Scheduler.builder()
			.desiredRetention(0.9)
			.learningSteps(new Duration[0])
			.relearningSteps(new Duration[0])
			.maximumInterval(36500)
			.enableFuzzing(fuzzIntervals)
			.build();
	}

	public record Recommendation(String stateJson, LocalDate reviewDate) {}

	public Recommendation firstReview(int modelCardId, Rating rating, Instant reviewedAt, ZoneId studentZone) {
		return review(Card.builder().cardId(modelCardId).build(), rating, reviewedAt, studentZone);
	}

	public Recommendation nextReview(String stateJson, Rating rating, Instant reviewedAt, ZoneId studentZone) {
		return review(Card.fromJson(stateJson), rating, reviewedAt, studentZone);
	}

	private Recommendation review(Card card, Rating rating, Instant reviewedAt, ZoneId studentZone) {
		// Encode the student's local date at UTC midnight so crossing midnight counts as a new study day.
		var modelTime = reviewedAt.atZone(studentZone).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
		Card updated = scheduler.reviewCard(card, rating, modelTime).card();
		return new Recommendation(updated.toJson(), updated.getDue().atZone(ZoneOffset.UTC).toLocalDate());
	}
}
