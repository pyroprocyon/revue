package com.revue;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.identity.application.ArchitectureApplicationFixtures;
import com.revue.identity.domain.ArchitectureDomainFixtures;
import com.revue.identity.infrastructure.ArchitectureInfrastructureFixtures;
import com.revue.identity.presentation.ArchitecturePresentationFixtures;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Run the production rules against test-only classes in a context without a production domain yet. */
class ArchitectureGuardTests {

    @Test
    void theNewDomainCanUseItsOwnValuesJavaAndNullabilityAnnotations() {
        assertThatNoException().isThrownBy(
            () -> ArchitectureTests.checkDomainDependencies(importFixture(ArchitectureDomainFixtures.Value.class)));
    }

    @ParameterizedTest
    @MethodSource("invalidDomainDependencies")
    void theNewDomainRejectsFrameworkAndForeignDomainTypes(Class<?> fixture, String forbiddenType) {
        assertThatThrownBy(() -> ArchitectureTests.checkDomainDependencies(importFixture(fixture)))
            .isInstanceOf(AssertionError.class)
            .hasMessageContaining(forbiddenType);
    }

    static Stream<Arguments> invalidDomainDependencies() {
        return Stream.of(
            Arguments
                .of(ArchitectureDomainFixtures.SecurityLeak.class, "org.springframework.security.core.Authentication"),
            Arguments.of(ArchitectureDomainFixtures.ForeignDomainLeak.class, "com.revue.reviews.domain.ReviewRating"));
    }

    @Test
    void theNewApplicationCanUseItsOwnDomainAndAcceptedSpringAnnotations() {
        assertThatNoException().isThrownBy(
            () -> ArchitectureTests
                .checkApplicationDependencies(importFixture(ArchitectureApplicationFixtures.OwnDomain.class)));
    }

    @ParameterizedTest
    @MethodSource("invalidApplicationDependencies")
    void theNewApplicationRejectsAdaptersTransportAndOtherContexts(Class<?> fixture, String forbiddenType) {
        assertThatThrownBy(() -> ArchitectureTests.checkApplicationDependencies(importFixture(fixture)))
            .isInstanceOf(AssertionError.class)
            .hasMessageContaining(forbiddenType);
    }

    static Stream<Arguments> invalidApplicationDependencies() {
        return Stream.of(
            Arguments.of(
                ArchitectureApplicationFixtures.InfrastructureLeak.class,
                "com.revue.identity.infrastructure.SecurityConfig"),
            Arguments.of(ArchitectureApplicationFixtures.PersistenceLeak.class, "jakarta.persistence.EntityManager"),
            Arguments.of(
                ArchitectureApplicationFixtures.SecurityLeak.class,
                "org.springframework.security.core.Authentication"),
            Arguments
                .of(ArchitectureApplicationFixtures.TransportLeak.class, "org.springframework.http.ResponseEntity"),
            Arguments.of(
                ArchitectureApplicationFixtures.ForeignApplicationLeak.class,
                "com.revue.content.application.PublicSetService"));
    }

    @Test
    void adaptersCanUseApplicationContracts() {
        assertThatNoException().isThrownBy(
            () -> ArchitectureTests.checkAdapterDependencies(
                importAdapterFixture(ArchitectureInfrastructureFixtures.UsesApplicationPort.class)));
    }

    @Test
    void presentationCannotUseTheSecurityPrincipalDirectly() {
        assertThatThrownBy(
            () -> ArchitectureTests
                .checkAdapterDependencies(importAdapterFixture(ArchitecturePresentationFixtures.SecurityLeak.class)))
            .isInstanceOf(AssertionError.class)
            .hasMessageContaining("org.springframework.security.core.Authentication");
    }

    @Test
    void infrastructureCannotDependOnPresentation() {
        assertThatThrownBy(
            () -> ArchitectureTests.checkAdapterDependencies(
                importAdapterFixture(ArchitectureInfrastructureFixtures.PresentationLeak.class)))
            .isInstanceOf(AssertionError.class)
            .hasMessageContaining(ArchitecturePresentationFixtures.UsesApplication.class.getName());
    }

    private static JavaClasses importAdapterFixture(Class<?> fixture) {
        return new ClassFileImporter().importClasses(
            fixture,
            ArchitecturePresentationFixtures.UsesApplication.class,
            ArchitectureInfrastructureFixtures.UsesApplicationPort.class);
    }

    private static JavaClasses importFixture(Class<?> fixture) {
        return new ClassFileImporter().importClasses(fixture);
    }
}
