package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.revue.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** PostgreSQL issues invitations, so server clock differences must not change their validity. */
@SpringBootTest(properties = "revue.content.publish=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class InvitationClockTests {
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private MockMvc mvc;
    @MockitoBean
    private Clock clock;

    private final UUID invitationId = UUID.randomUUID();

    @AfterEach
    void revokeInvitation() {
        jdbc.update("UPDATE signup_invites SET revoked_at = clock_timestamp() WHERE id = ?", invitationId);
    }

    @ParameterizedTest
    @ValueSource(longs = {-30, 3600})
    void freshSharedInvitationWorksDespiteApplicationClockSkew(long offsetSeconds) throws Exception {
        when(clock.instant()).thenAnswer(ignored -> Instant.now().plusSeconds(offsetSeconds));
        String token = invitation(0, 600);
        for (int learner = 0; learner < 2; learner++) {
            String username = username();
            register(token, username).andExpect(status().isOk());
            assertThat(accountCount(username)).isEqualTo(1);
        }
    }

    @ParameterizedTest
    @ValueSource(longs = {-3600, 3600})
    void expiredOrFutureInvitationStaysUnavailableDespiteApplicationClockSkew(long offsetSeconds) throws Exception {
        when(clock.instant()).thenAnswer(ignored -> Instant.now().plusSeconds(offsetSeconds));
        // Java time falls inside this window. Database time falls outside it.
        String token = invitation(offsetSeconds - 600, offsetSeconds + 600);
        String username = username();
        register(token, username).andExpect(status().isBadRequest());
        assertThat(accountCount(username)).isZero();
    }

    private String invitation(long startsInSeconds, long expiresInSeconds) throws Exception {
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String hash = HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        jdbc.update(
            "INSERT INTO signup_invites (id, token_hash, created_at, expires_at, reusable) VALUES (?, ?,"
                + " statement_timestamp() + (? * interval '1 second'),"
                + " statement_timestamp() + (? * interval '1 second'), true)",
            invitationId,
            hash,
            startsInSeconds,
            expiresInSeconds);
        return token;
    }

    private ResultActions register(String token, String username) throws Exception {
        return mvc.perform(
            post("/api/v1/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", username)
                .param("password", "kanjii")
                .param("invitation", token));
    }

    private int accountCount(String username) {
        return jdbc.queryForObject("SELECT count(*) FROM users WHERE username = ?", Integer.class, username);
    }

    private String username() {
        return "clock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }
}
