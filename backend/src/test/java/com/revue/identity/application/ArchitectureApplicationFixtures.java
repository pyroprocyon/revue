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

    /** Application fixture with its own domain and accepted Spring transaction annotations. */
    @Service
    @Transactional
    public abstract static class OwnDomain {
        /** Returns the fixture's own domain value. */
        public abstract Value value();
    }

    /** Application fixture with a forbidden infrastructure dependency. */
    public record InfrastructureLeak(SecurityConfig configuration) {}

    /** Application fixture with a forbidden persistence dependency. */
    public record PersistenceLeak(EntityManager entityManager) {}

    /** Application fixture with a forbidden security dependency. */
    public record SecurityLeak(Authentication authentication) {}

    /** Application fixture with a forbidden HTTP transport dependency. */
    public record TransportLeak(ResponseEntity<String> response) {}

    /** Application fixture with a forbidden foreign application dependency. */
    public record ForeignApplicationLeak(PublicSetService publicSets) {}
}
