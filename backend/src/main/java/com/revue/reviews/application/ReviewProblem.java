package com.revue.reviews.application;

/** Bounded review outcomes; transport failures never imply that a rating was not committed. */
public class ReviewProblem extends RuntimeException {
    private final Kind kind;

    /** Reasons safe for the authenticated learner to act on. */
    public enum Kind {
        INVALID_RATING,
        INVALID_LIMIT,
        UNAVAILABLE,
        STALE_SCHEDULE,
        NOT_DUE,
        DAILY_LIMIT,
        REQUEST_REUSED,
        UNSUPPORTED_SCHEDULER
    }

    /** Creates a failure that rolls back the complete review transaction. */
    public ReviewProblem(Kind kind) {
        super(kind.name());
        this.kind = kind;
    }

    /** Returns the bounded reason. */
    public Kind kind() {
        return kind;
    }
}
