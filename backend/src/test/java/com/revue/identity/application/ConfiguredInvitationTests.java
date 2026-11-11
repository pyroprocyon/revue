package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.revue.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest(properties = {"revue.content.publish=false", "REVUE_PILOT_INVITE_CODE=TestCode"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ConfiguredInvitationTests {
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private MockMvc mvc;

    @Test
    void oneConfiguredCodeRegistersDifferentLearnersWithoutInvitationRows() throws Exception {
        int before = jdbc.queryForObject("select count(*) from signup_invites", Integer.class);
        for (int learner = 0; learner < 2; learner++) {
            String username = username();
            register("TestCode", username).andExpect(status().isOk());
            assertThat(accountCount(username)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("select count(*) from signup_invites", Integer.class)).isEqualTo(before);
    }

    @Test
    void anotherCodeCannotRegisterDespiteValidDatabaseInvitation() throws Exception {
        String oldCode = "OldCode1";
        String hash = HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(oldCode.getBytes(StandardCharsets.UTF_8)));
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, expires_at)"
                + " values (?, ?, now() - interval '1 minute', now() + interval '1 hour')",
            UUID.randomUUID(),
            hash);
        String username = username();
        register(oldCode, username).andExpect(status().isBadRequest());
        assertThat(accountCount(username)).isZero();
    }

    @Test
    void wrongCodeCannotCreateAnAccount() throws Exception {
        String username = username();
        register("WrongOne", username).andExpect(status().isBadRequest());
        assertThat(accountCount(username)).isZero();
    }

    @Test
    void duplicateUsernameDoesNotConsumeTheSharedInvitation() throws Exception {
        String username = username();
        register("TestCode", username).andExpect(status().isOk());
        register("TestCode", username).andExpect(status().isConflict());
        register("TestCode", username()).andExpect(status().isOk());
        assertThat(accountCount(username)).isEqualTo(1);
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
        return jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username);
    }

    private String username() {
        return "shared_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }
}
