package com.revue.identity.infrastructure;

import com.revue.identity.application.ArchitectureApplicationFixtures.OwnDomain;
import com.revue.identity.presentation.ArchitecturePresentationFixtures.UsesApplication;

/** Test-only adapter examples. */
public final class ArchitectureInfrastructureFixtures {

    /** Infrastructure fixture whose application-port dependency is allowed. */
    public record UsesApplicationPort(OwnDomain application) {
    }

    /** Infrastructure fixture with a forbidden presentation dependency. */
    public record PresentationLeak(UsesApplication endpoint) {
    }
}
