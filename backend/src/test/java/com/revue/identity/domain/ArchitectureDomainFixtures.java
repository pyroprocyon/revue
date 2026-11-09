package com.revue.identity.domain;

import com.revue.reviews.domain.ReviewRating;
import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.Authentication;

/** Test-only dependencies, deliberately including invalid account-layer examples. */
public final class ArchitectureDomainFixtures {

	public record Value(Instant createdAt, @Nullable String label) { }

	public record SecurityLeak(Authentication authentication) { }

	public record ForeignDomainLeak(ReviewRating rating) { }
}
