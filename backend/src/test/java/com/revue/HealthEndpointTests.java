package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.registry.HealthContributorRegistry;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The health check is what Docker Compose, the host and an uptime monitor call. It must work without signing in, reveal
 * nothing beyond UP or DOWN, and never query the database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class HealthEndpointTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private HealthContributorRegistry healthContributors;

    @Test
    void healthIsOpenAndShowsOnlyTheStatus() throws Exception {
        mvc.perform(get("/actuator/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"UP\"}", JsonCompareMode.STRICT));
    }

    @Test
    void healthAnswersHeadRequests() throws Exception {
        // Some uptime monitors send HEAD instead of GET.
        mvc.perform(head("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void healthHasNoDatabaseCheck() {
        assertThat(healthContributors.getContributor("db")).isNull();
    }
}
