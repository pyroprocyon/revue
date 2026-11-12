package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.registry.HealthContributorRegistry;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The health check is what Docker Compose, the host and an uptime monitor call. It must work without signing in, reveal
 * nothing beyond UP or DOWN, and expose database readiness separately from process liveness.
 */
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(properties = "revue.operations.token=test-only-operations-token-at-least-32-characters")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class HealthEndpointTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private HealthContributorRegistry healthContributors;

    @Test
    void databaseFailureRemovesReadinessWithoutFailingLiveness(CapturedOutput output) throws Exception {
        var database = healthContributors.unregisterContributor("db");
        var databaseChecks = new AtomicInteger();
        healthContributors.registerContributor("db", (HealthIndicator) () -> {
            databaseChecks.incrementAndGet();
            return Health.down().build();
        });
        try {
            mvc.perform(get("/actuator/health")).andExpect(status().isOk());
            mvc.perform(head("/actuator/health")).andExpect(status().isOk());
            mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
            assertThat(databaseChecks).hasValue(0);
            mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DOWN"));
            mvc.perform(get("/actuator/health/readiness")).andExpect(status().isServiceUnavailable());
            assertThat(databaseChecks).hasValue(2);
            assertThat(StructuredEvents.named(output, "service.availability_changed"))
                .filteredOn(event -> "readiness_probe".equals(event.at("/entity/type").asString()))
                .singleElement()
                .satisfies(event -> assertThat(event.at("/state/to").asString()).isEqualTo("UNAVAILABLE"));
        } finally {
            healthContributors.unregisterContributor("db");
            healthContributors.registerContributor("db", database);
        }
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
        assertThat(StructuredEvents.named(output, "service.availability_changed"))
            .filteredOn(event -> "readiness_probe".equals(event.at("/entity/type").asString()))
            .last()
            .satisfies(event -> {
                assertThat(event.at("/state/from").asString()).isEqualTo("UNAVAILABLE");
                assertThat(event.at("/state/to").asString()).isEqualTo("UP");
            });
    }

    @Test
    @WithMockUser(authorities = "LEARNER")
    void learnerAuthorityDoesNotGrantOperationalAccess() throws Exception {
        mvc.perform(get("/actuator/metrics")).andExpect(status().isForbidden());
    }

    @Test
    void healthIsOpenAndShowsOnlyTheStatus() throws Exception {
        mvc.perform(get("/actuator/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void healthAnswersHeadRequests() throws Exception {
        // Some uptime monitors send HEAD instead of GET.
        mvc.perform(head("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void readinessHasDatabaseCheck() {
        assertThat(healthContributors.getContributor("db")).isNotNull();
    }

    @Test
    void probesArePublicAndMetricsRequireTheirOwnCredential() throws Exception {
        mvc.perform(get("/actuator/health/liveness"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/actuator/health/readiness"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/actuator/metrics")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/metrics").header("Authorization", "Bearer wrong"))
            .andExpect(status().isUnauthorized());
        mvc.perform(
            get("/actuator/metrics")
                .header("Authorization", "Bearer test-only-operations-token-at-least-32-characters"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.names").isArray());
        mvc.perform(
            post("/actuator/metrics")
                .header("Authorization", "Bearer test-only-operations-token-at-least-32-characters"))
            .andExpect(status().isForbidden());
    }

    @Test
    void metricsCredentialDoesNotAuthorizeOtherHttpMethods() throws Exception {
        String credential = "Bearer test-only-operations-token-at-least-32-characters";
        mvc.perform(head("/actuator/metrics").header("Authorization", credential)).andExpect(status().isUnauthorized());
        mvc.perform(post("/actuator/metrics").with(csrf()).header("Authorization", credential))
            .andExpect(status().isUnauthorized());
    }

}
