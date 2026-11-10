package com.revue.identity.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Account deletion request with its recovery and eventual purge deadline. */
public record DeletionRequest(UUID id, Instant requestedAt, Instant purgeAfter) {
    public static final Duration RECOVERY_WINDOW = Duration.ofDays(7);

    /** Validates that the request contains an identity and an ordered recovery window. */
    public DeletionRequest {
        Objects.requireNonNull(id);
        Objects.requireNonNull(requestedAt);
        Objects.requireNonNull(purgeAfter);
        if (!purgeAfter.isAfter(requestedAt)) {
            throw new IllegalArgumentException("Invalid deletion deadline");
        }
    }

    /** Creates a deletion request with the configured recovery window starting now. */
    public static DeletionRequest schedule(UUID id, Instant now) {
        return new DeletionRequest(id, now, now.plus(RECOVERY_WINDOW));
    }
}
