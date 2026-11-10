package com.revue.identity.domain;

import com.revue.reviews.domain.ReviewRating;
import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.Authentication;

/** Test-only dependencies, deliberately including invalid account-layer examples. */
public final class ArchitectureDomainFixtures {

    /** Domain fixture containing only accepted JDK and nullability types. */
    public record Value(Instant createdAt, @Nullable String label) {}

    /** Domain fixture with a forbidden security-framework dependency. */
    public record SecurityLeak(Authentication authentication) {}

    /** Domain fixture with a forbidden foreign-domain dependency. */
    public record ForeignDomainLeak(ReviewRating rating) {}
}
