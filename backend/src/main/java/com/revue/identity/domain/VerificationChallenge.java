package com.revue.identity.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Initial verification challenge; consuming and replacing challenges belongs to the verification slice. */
public record VerificationChallenge(
        UUID id, UUID accountId, TokenHash tokenHash, long credentialVersion, Instant createdAt, Instant expiresAt) {
    /** Validates the required identity, account, token and timing fields of the challenge. */
    public VerificationChallenge {
        Objects.requireNonNull(id);
        Objects.requireNonNull(accountId);
        Objects.requireNonNull(tokenHash);
        Objects.requireNonNull(createdAt);
        Objects.requireNonNull(expiresAt);
        if (credentialVersion < 0 || !expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException("Invalid verification challenge");
        }
    }
}
