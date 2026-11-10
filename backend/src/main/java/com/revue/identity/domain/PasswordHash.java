package com.revue.identity.domain;

import java.util.Objects;

/** Already encoded by the password adapter, including its algorithm/version prefix. No raw password. */
public record PasswordHash(String value) {
    /** Validates the format and size of an encoded password hash. */
    public PasswordHash {
        Objects.requireNonNull(value, "Password hash is required");
        if (value.length() > 1024 || !value.matches("\\{[A-Za-z0-9@._-]+}[^\\s]+")) {
            throw new IllegalArgumentException("An encoded password with an algorithm prefix is required");
        }
    }

    @Override
    public String toString() {
        return "PasswordHash[redacted]";
    }
}
