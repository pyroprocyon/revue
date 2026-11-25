package com.revue.content.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicCatalogAdmissionFilterTests {
    private final PublicCatalogAdmissionFilter filter = new PublicCatalogAdmissionFilter(
        PublicCatalogAdmissionFilter.publicCatalogPermits());

    @Test
    void fullCatalogRejectsBeforeDispatchAndLeavesStudyAndHealthAccessible() throws Exception {
        assertThatIOException().isThrownBy(() -> visit("/api/v1/public-sets", (_, _) -> {
            throw new IOException("Disconnected");
        }));
        var list = visit("/api/v1/public-sets", (_, _) -> {
            var summary = visit("/api/v1/public-sets/key", (_, _) -> {
                var trial = visit("/api/v1/public-sets/key/demo-cards", (_, _) -> checkFullCatalog());
                assertThat(trial.getStatus()).isEqualTo(200);
            });
            assertThat(summary.getStatus()).isEqualTo(200);
        });
        assertThat(list.getStatus()).isEqualTo(200);
    }

    private void checkFullCatalog() throws IOException, ServletException {
        var rejected = visit("/api/v1/public-sets/share/1/summary", (_, _) -> {
            throw new AssertionError("Excess catalog request reached the application");
        });
        assertThat(rejected.getStatus()).isEqualTo(503);
        assertThat(rejected.getHeader("Retry-After")).isEqualTo("1");
        assertThat(rejected.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(visit("/api/v1/cards/due", (_, response) -> response.flushBuffer()).isCommitted()).isTrue();
        assertThat(visit("/actuator/health", (_, response) -> response.flushBuffer()).isCommitted()).isTrue();
    }

    private MockHttpServletResponse visit(String path, FilterChain chain) throws IOException, ServletException {
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", path), response, chain);
        return response;
    }
}
