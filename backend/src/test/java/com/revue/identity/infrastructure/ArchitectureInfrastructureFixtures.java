package com.revue.identity.infrastructure;

import com.revue.identity.application.ArchitectureApplicationFixtures.OwnDomain;
import com.revue.identity.presentation.ArchitecturePresentationFixtures.UsesApplication;

/** Test-only adapter examples. */
public final class ArchitectureInfrastructureFixtures {

	public record UsesApplicationPort(OwnDomain application) { }

	public record PresentationLeak(UsesApplication endpoint) { }
}
