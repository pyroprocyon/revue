package com.revue.reviews.infrastructure.fsrs;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.ReviewRating;
import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class DailyReviewSchedulerTests {

    @Test
    void allRatingsAdvanceToLaterLocalDayDuringFallBack() {
        var scheduler = new DailyReviewScheduler(new FsrsMemoryModel(true));
        var zone = ZoneId.of("America/New_York");
        var instant = Instant.parse("2026-11-01T04:30:00Z");
        for (Rating rating : Rating.values()) {
            var recommendation = scheduler.firstReview(17, ReviewRating.valueOf(rating.name()), instant, zone);
            assertThat(recommendation.reviewDate()).isAfter(LocalDate.of(2026, 11, 1));
            if (rating == Rating.AGAIN) {
                assertThat(recommendation.reviewDate()).isEqualTo(LocalDate.of(2026, 11, 2));
            }
        }
    }

    @Test
    void restoredStateMatchesUninterruptedReviewsAcrossMidnightAndAfterLapse() {
        var zone = ZoneId.of("Asia/Manila");
        var reference = Scheduler.builder()
            .desiredRetention(0.9)
            .learningSteps(new Duration[0])
            .relearningSteps(new Duration[0])
            .enableFuzzing(false)
            .build();
        var times = new String[] {"2026-11-05T13:00:00Z", "2026-11-06T12:50:00Z", "2026-11-23T16:05:00Z"};
        var modelDates = new String[] {"2026-11-05", "2026-11-06", "2026-11-24"};
        var ratings = new Rating[] {Rating.GOOD, Rating.AGAIN, Rating.HARD};
        var expected = Card.builder().cardId(42).build();
        String state = null;
        for (int i = 0; i < times.length; i++) {
            var restarted = new DailyReviewScheduler(new FsrsMemoryModel(false));
            var actual = i == 0
                ? restarted.firstReview(42, ReviewRating.valueOf(ratings[i].name()), Instant.parse(times[i]), zone)
                : restarted.nextReview(state, ReviewRating.valueOf(ratings[i].name()), Instant.parse(times[i]), zone);
            expected = reference.reviewCard(expected, ratings[i], Instant.parse(modelDates[i] + "T00:00:00Z")).card();
            state = actual.stateJson();
            assertThat(Card.fromJson(state)).isEqualTo(expected);
            assertThat(actual.reviewDate()).isEqualTo(LocalDate.ofInstant(expected.getDue(), ZoneOffset.UTC));
        }
    }
}
