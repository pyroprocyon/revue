package com.revue.identity.presentation;

import com.revue.identity.application.ArchitectureApplicationFixtures.OwnDomain;
import org.springframework.security.core.Authentication;

/** Test-only HTTP-boundary examples without controller registration. */
public final class ArchitecturePresentationFixtures {

    /** Presentation fixture whose application dependency is allowed by the architecture rules. */
    public record UsesApplication(OwnDomain application) {
    }

    /** Presentation fixture with a forbidden security-framework dependency. */
    public record SecurityLeak(Authentication authentication) {
    }
}
