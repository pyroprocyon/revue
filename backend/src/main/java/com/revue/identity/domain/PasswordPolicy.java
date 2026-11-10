package com.revue.identity.domain;

import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Defines the pilot password length and common-password restrictions. */
public final class PasswordPolicy {
    private static final Set<String> COMMON =
            Set.of(
                    "123456",
                    "1234567",
                    "12345678",
                    "123456789",
                    "1234567890",
                    "password",
                    "password1",
                    "password123",
                    "qwerty",
                    "qwerty123",
                    "abc123",
                    "abcdef",
                    "111111",
                    "000000",
                    "letmein",
                    "welcome",
                    "iloveyou",
                    "admin123");

    private PasswordPolicy() {}

    /** Checks password length, Unicode validity and the common-password blocklist. */
    public static void validate(String password) {
        validateLength(password);
        if (COMMON.contains(password.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Choose a less common password");
        }
    }

    /** Checks the password's Unicode code-point length without changing its characters. */
    public static void validateLength(String password) {
        Objects.requireNonNull(password, "Password is required");
        if (password.length() > 128
                || password.codePointCount(0, password.length()) < 6
                || password.codePointCount(0, password.length()) > 64
                || password.codePoints().anyMatch(point -> point >= 0xD800 && point <= 0xDFFF)) {
            throw new IllegalArgumentException("Use a password of 6–64 characters");
        }
    }
}
