package com.revue.identity.application;

/** Carries a safe account failure and its HTTP-independent category. */
public class AccountProblem extends RuntimeException {
    private final Kind kind;

    public AccountProblem(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    /** Failure categories with distinct credential, availability and overload handling. */
    public enum Kind {
        INVALID_CREDENTIALS,
        UNAVAILABLE_USERNAME,
        OVERLOADED
    }
}
