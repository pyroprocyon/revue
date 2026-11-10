package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A signed-out API request gets a plain 401, and no signed-out request leaves anything behind. Bots send many such
 * requests, so a request must not create a session row in PostgreSQL or set a session cookie.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SignedOutRequestTests {

    @Autowired private MockMvc mvc;

    @Autowired private JdbcTemplate jdbc;

    @Test
    void protectedRoutesAnswer401() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
    }

    @Test
    void signedOutRequestsCreateNoSession() throws Exception {
        int sessionsBefore = countSessions();

        // A bot probing for a file. Files outside /api are public, so a missing one is a plain 404.
        mvc.perform(get("/wp-login.php").header(HttpHeaders.ACCEPT, "text/html"))
                .andExpect(status().isNotFound())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        mvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        assertThat(countSessions()).isEqualTo(sessionsBefore);
    }

    private int countSessions() {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM spring_session", Integer.class);
        return count == null ? 0 : count;
    }
}
