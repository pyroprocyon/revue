package com.revue.identity.application;

import com.revue.content.application.PublicSetService;
import com.revue.identity.domain.ArchitectureDomainFixtures.Value;
import com.revue.identity.infrastructure.SecurityConfig;
import jakarta.persistence.EntityManager;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Abstract services stay out of Spring's component scan. These are not account features. */
public final class ArchitectureApplicationFixtures {

	@Service
	@Transactional
	public abstract static class OwnDomain {
		public abstract Value value();
	}

	public record InfrastructureLeak(SecurityConfig configuration) { }

	public record PersistenceLeak(EntityManager entityManager) { }

	public record SecurityLeak(Authentication authentication) { }

	public record TransportLeak(ResponseEntity<String> response) { }

	public record ForeignApplicationLeak(PublicSetService publicSets) { }
}
