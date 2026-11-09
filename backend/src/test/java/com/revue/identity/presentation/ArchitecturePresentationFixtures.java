package com.revue.identity.presentation;

import com.revue.identity.application.ArchitectureApplicationFixtures.OwnDomain;
import org.springframework.security.core.Authentication;

/** Test-only HTTP-boundary examples without controller registration. */
public final class ArchitecturePresentationFixtures {

	public record UsesApplication(OwnDomain application) { }

	public record SecurityLeak(Authentication authentication) { }
}
