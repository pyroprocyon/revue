package com.revue.reviews.presentation;

import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.ReviewProblem;
import com.revue.reviews.application.ReviewService;
import com.revue.reviews.application.ReviewStore;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Authenticated, private daily-study endpoints with existing session and CSRF enforcement. */
@RestController
public class ReviewController {
    private static final String STUDY_SETTINGS_PATH = "/api/v1/me/study-settings";
    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping(STUDY_SETTINGS_PATH)
    StudySettings studySettings() {
        return new StudySettings(reviews.dailyNewCardLimit());
    }

    @PutMapping(STUDY_SETTINGS_PATH)
    StudySettings updateStudySettings(@RequestBody JsonNode settings) {
        var limit = settings.path("dailyNewCardLimit");
        if (!limit.isIntegralNumber() || !limit.canConvertToInt()) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_NEW_CARD_LIMIT);
        }
        return new StudySettings(reviews.setDailyNewCardLimit(limit.asInt()));
    }

    record StudySettings(int dailyNewCardLimit) {
    }

    @GetMapping("/api/v1/cards/due")
    ReviewStore.Queue due(
        @RequestParam(defaultValue = "5") int limit,
        @RequestParam(required = false) @Nullable String topic,
        @RequestParam(defaultValue = "false") boolean includeNew,
        @RequestParam(defaultValue = "false") boolean summaryOnly,
        @RequestParam(required = false) @Nullable String pausedTopic) {
        return reviews.queue(limit, topic, includeNew, summaryOnly, pausedTopic);
    }

    @PostMapping("/api/v1/reviews/{cardId}")
    ReviewStore.Result rate(@PathVariable long cardId, @RequestBody Submission input) {
        if (input.expectedVersion() == null || input.contentVersion() == null) {
            throw new ReviewProblem(ReviewProblem.Kind.INVALID_RATING);
        }
        return reviews.rate(
            cardId,
            ReviewStore.Rating.parse(
                input.rating(),
                input.attemptMode(),
                input.requestId(),
                input.expectedVersion(),
                input.contentVersion()));
    }

    record Submission(String rating, String attemptMode, UUID requestId, Long expectedVersion, Integer contentVersion) {
    }

    @ExceptionHandler(ReviewProblem.class)
    ResponseEntity<ProblemDetail> problem(ReviewProblem failure) {
        HttpStatus status = switch (failure.kind()) {
            case INVALID_RATING, INVALID_LIMIT, INVALID_NEW_CARD_LIMIT, INVALID_TOPIC ->
                HttpStatus.UNPROCESSABLE_CONTENT;
            case UNAVAILABLE -> HttpStatus.NOT_FOUND;
            case UNSUPPORTED_SCHEDULER -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.CONFLICT;
        };
        var body = ProblemDetail.forStatus(status);
        body.setProperty("reason", failure.kind().name());
        if (failure.currentCard() != null) {
            body.setProperty("card", failure.currentCard());
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }

    @ExceptionHandler(LibraryProblem.class)
    ResponseEntity<Void> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .cacheControl(CacheControl.noStore().cachePrivate())
            .build();
    }
}
