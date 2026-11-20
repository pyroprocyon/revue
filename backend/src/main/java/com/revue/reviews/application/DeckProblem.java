package com.revue.reviews.application;

import org.jspecify.annotations.Nullable;

/** Expected personal-deck failures that are safe to show to the signed-in learner. */
public class DeckProblem extends RuntimeException {
    private final Kind kind;
    private final long availableCards;

    /** Distinguishes rejected input, a deck or card the learner cannot use, and account limits. */
    public enum Kind {
        INVALID_TEXT,
        INVALID_PAGE,
        NOT_FOUND,
        DECK_LIMIT,
        STALE_CARD,
        CREATE_CONFLICT,
        CARD_LIMIT
    }

    public DeckProblem(Kind kind) {
        this(kind, null);
    }

    /** Keeps the validation failure that explains why the text was rejected. */
    public DeckProblem(Kind kind, @Nullable Throwable cause) {
        this(kind, cause, 0);
    }

    private DeckProblem(Kind kind, @Nullable Throwable cause, long availableCards) {
        super(kind.name(), cause);
        this.kind = kind;
        this.availableCards = availableCards;
    }

    public static DeckProblem cardLimit(long availableCards) {
        return new DeckProblem(Kind.CARD_LIMIT, null, availableCards);
    }

    public Kind kind() {
        return kind;
    }

    public long availableCards() {
        return availableCards;
    }
}
