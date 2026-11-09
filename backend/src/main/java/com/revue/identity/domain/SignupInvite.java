package com.revue.identity.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

public record SignupInvite(UUID id, TokenHash tokenHash, Instant createdAt, Instant expiresAt,
		@Nullable Instant revokedAt, @Nullable Instant redeemedAt, @Nullable UUID redeemedByUserId) {
	public SignupInvite {
		Objects.requireNonNull(id);
		Objects.requireNonNull(tokenHash);
		Objects.requireNonNull(createdAt);
		Objects.requireNonNull(expiresAt);
		if (!expiresAt.isAfter(createdAt) || (redeemedByUserId != null && redeemedAt == null)
				|| (redeemedAt != null && (redeemedAt.isBefore(createdAt) || !redeemedAt.isBefore(expiresAt)))) {
			throw new IllegalArgumentException("Invalid invitation state");
		}
	}

	public SignupInvite redeem(UUID accountId, Instant now) {
		Objects.requireNonNull(accountId);
		if (revokedAt != null || redeemedAt != null || now.isBefore(createdAt) || !now.isBefore(expiresAt)) {
			throw new IllegalStateException("Invitation is unavailable");
		}
		return new SignupInvite(id, tokenHash, createdAt, expiresAt, revokedAt, now, accountId);
	}
}
