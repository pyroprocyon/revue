package com.revue.identity.domain;

import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

/** Pilot syntax: ASCII dot-atom local part and DNS domain. Dots and aliases remain significant. */
public record EmailAddress(String value) {
    private static final Pattern LABEL = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");

    /** Canonicalizes and validates an email address. */
    public EmailAddress {
        Objects.requireNonNull(value, "Email is required");
        if (value.length() > 1024) {
            throw new IllegalArgumentException("Email is too long");
        }
        value = trimOuterAsciiWhitespace(value);
        // Reject Unicode before case conversion: some Unicode characters lowercase to ASCII.
        if (!value.chars().allMatch(c -> c < 128)) {
            throw new IllegalArgumentException("Unsupported email syntax");
        }
        value = value.toLowerCase(Locale.ROOT);
        int at = value.indexOf('@');
        if (value.length() > 254 || at < 1 || at > 64 || !validLocalPart(value.substring(0, at))) {
            throw new IllegalArgumentException("Unsupported email syntax");
        }
        String[] labels = value.substring(at + 1).split("\\.", -1);
        if (labels.length < 2) {
            throw new IllegalArgumentException("Unsupported email domain");
        }
        for (String label : labels) {
            if (!LABEL.matcher(label).matches()) {
                throw new IllegalArgumentException("Unsupported email domain");
            }
        }
    }

    private static String trimOuterAsciiWhitespace(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isAsciiWhitespace(text.charAt(start))) {
            start++;
        }
        while (end > start && isAsciiWhitespace(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(start, end);
    }

    private static boolean isAsciiWhitespace(char character) {
        return character == ' ' || (character >= '\t' && character <= '\r');
    }

    private static boolean validLocalPart(String local) {
        if (local.startsWith(".") || local.endsWith(".") || local.contains("..")) {
            return false;
        }
        for (int index = 0; index < local.length(); index++) {
            char character = local.charAt(index);
            if (!isAtomCharacter(character) && character != '.') {
                return false;
            }
        }
        return true;
    }

    private static boolean isAtomCharacter(char character) {
        return (character >= 'a' && character <= 'z')
                || (character >= '0' && character <= '9')
                || "!#$%&'*+/=?^_`{|}~-".indexOf(character) >= 0;
    }

    @Override
    public String toString() {
        return "EmailAddress[redacted]";
    }
}
