package com.revue.identity.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record DeletionRequest(UUID id, Instant requestedAt, Instant purgeAfter) {
	public static final Duration RECOVERY_WINDOW = Duration.ofDays(7);

	public DeletionRequest {
		Objects.requireNonNull(id);
		Objects.requireNonNull(requestedAt);
		Objects.requireNonNull(purgeAfter);
		if (!purgeAfter.isAfter(requestedAt)) {
			throw new IllegalArgumentException("Invalid deletion deadline");
		}
	}

	public static DeletionRequest schedule(UUID id, Instant now) {
		return new DeletionRequest(id, now, now.plus(RECOVERY_WINDOW));
	}
}
