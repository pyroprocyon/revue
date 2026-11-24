package com.revue.reviews.application;

/** Expected library failures without exposing private account or publication details. */
public class LibraryProblem extends RuntimeException {
    private final Kind kind;

    /** Expected failures returned by the Library endpoints. */
    public enum Kind {
        UNAUTHENTICATED,
        UNAVAILABLE,
        INVALID_PAGE,
        SAVED_SET_LIMIT
    }

    public LibraryProblem(Kind kind) {
        super(kind.name());
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
