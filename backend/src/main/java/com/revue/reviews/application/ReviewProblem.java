package com.revue.reviews.application;

import org.jspecify.annotations.Nullable;

/** Bounded review outcomes; transport failures never imply that a rating was not committed. */
public class ReviewProblem extends RuntimeException {
    private final Kind kind;
    private final transient ReviewStore.@Nullable Card currentCard;

    /** Reasons safe for the authenticated learner to act on. */
    public enum Kind {
        INVALID_RATING,
        INVALID_LIMIT,
        INVALID_NEW_CARD_LIMIT,
        INVALID_TOPIC,
        UNAVAILABLE,
        STALE_SCHEDULE,
        NOT_DUE,
        DAILY_LIMIT,
        CONTENT_CHANGED,
        REQUEST_REUSED,
        UNSUPPORTED_SCHEDULER
    }

    /** Creates a failure that rolls back the complete review transaction. */
    public ReviewProblem(Kind kind) {
        this(kind, null);
    }

    private ReviewProblem(Kind kind, ReviewStore.@Nullable Card currentCard) {
        super(kind.name());
        this.kind = kind;
        this.currentCard = currentCard;
    }

    /** Refuses a rating of text the card no longer has, returning the current card for a fresh attempt. */
    public static ReviewProblem contentChanged(ReviewStore.Card currentCard) {
        return new ReviewProblem(Kind.CONTENT_CHANGED, currentCard);
    }

    public Kind kind() {
        return kind;
    }

    public ReviewStore.@Nullable Card currentCard() {
        return currentCard;
    }
}
