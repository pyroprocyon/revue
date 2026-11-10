package com.revue.identity.domain;

import java.util.Locale;
import java.util.Objects;

/** The pilot uses one lowercase ASCII key for lookup, uniqueness and admission. */
public record Username(String value) {
    /** Canonicalizes and validates the pilot's ASCII username. */
    public Username {
        Objects.requireNonNull(value, "Username is required");
        if (value.length() > 128 || !value.chars().allMatch(character -> character < 128)) {
            throw new IllegalArgumentException("Use 3–32 letters, numbers, underscores or hyphens for your username");
        }
        value = value.strip().toLowerCase(Locale.ROOT);
        if (!value.matches("[a-z0-9_-]{3,32}")) {
            throw new IllegalArgumentException("Use 3–32 letters, numbers, underscores or hyphens for your username");
        }
    }

    @Override
    public String toString() {
        return "Username[redacted]";
    }
}
