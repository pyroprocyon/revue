package com.revue.reviews.application;

/** Expected library failures without exposing private account or publication details. */
public class LibraryProblem extends RuntimeException {
    private final Kind kind;

    /** Distinguishes authentication, unavailable content and invalid paging. */
    public enum Kind {
        UNAUTHENTICATED,
        UNAVAILABLE,
        INVALID_PAGE
    }

    /** Creates a bounded failure. */
    public LibraryProblem(Kind kind) {
        super(kind.name());
        this.kind = kind;
    }

    /** Returns the safe failure category. */
    public Kind kind() {
        return kind;
    }
}
