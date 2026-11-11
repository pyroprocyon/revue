package com.revue.identity.application;

import com.revue.identity.domain.TokenHash;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** One configured invitation shared by local and hosted apps, independent of their databases. */
public final class PilotInvitation {
    private final TokenHash configuredHash;

    /** An empty setting preserves existing database invitations during rollout. */
    public PilotInvitation(String code) {
        configuredHash = code.isEmpty() ? null : hash(code);
    }

    /** Whether a configured code replaces database-issued invitations. */
    public boolean isConfigured() {
        return configuredHash != null;
    }

    /** Compares digests without retaining or logging the configured raw code. */
    public boolean accepts(TokenHash submitted) {
        return configuredHash != null
            && MessageDigest.isEqual(
                configuredHash.value().getBytes(StandardCharsets.UTF_8),
                submitted.value().getBytes(StandardCharsets.UTF_8));
    }

    /** Validates supported invitation formats and hashes the code before passing it to persistence. */
    public static TokenHash hash(String code) {
        if (code == null || !code.matches("(?:[A-Za-z0-9_-]{8}|[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})")) {
            throw new IllegalArgumentException("Use your invitation link to create an account");
        }
        try {
            return new TokenHash(
                HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8))));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable", unavailable);
        }
    }
}
