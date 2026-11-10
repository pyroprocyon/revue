package com.revue.identity.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Invitation validity and revocation, with optional reuse for the shared pilot link. */
public record SignupInvite(
        UUID id,
        TokenHash tokenHash,
        Instant createdAt,
        Instant expiresAt,
        @Nullable Instant revokedAt,
        @Nullable Instant redeemedAt,
        @Nullable UUID redeemedByUserId,
        boolean reusable) {
    /** Validates the invitation's required fields and lifecycle timestamps. */
    public SignupInvite {
        Objects.requireNonNull(id);
        Objects.requireNonNull(tokenHash);
        Objects.requireNonNull(createdAt);
        Objects.requireNonNull(expiresAt);
        if ((reusable && (redeemedAt != null || redeemedByUserId != null))
                || !expiresAt.isAfter(createdAt)
                || (redeemedByUserId != null && redeemedAt == null)
                || (redeemedAt != null && (redeemedAt.isBefore(createdAt) || !redeemedAt.isBefore(expiresAt)))) {
            throw new IllegalArgumentException("Invalid invitation state");
        }
    }

    /** Admits an account, recording redemption only for a single-use invitation. */
    public SignupInvite redeem(UUID accountId, Instant now) {
        Objects.requireNonNull(accountId);
        if (revokedAt != null || redeemedAt != null || now.isBefore(createdAt) || !now.isBefore(expiresAt)) {
            throw new IllegalStateException("Invitation is unavailable");
        }
        if (reusable) {
            return this;
        }
        return new SignupInvite(id, tokenHash, createdAt, expiresAt, revokedAt, now, accountId, false);
    }
}
