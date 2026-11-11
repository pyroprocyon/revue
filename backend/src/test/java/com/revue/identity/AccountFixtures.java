package com.revue.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Authenticate through the actual pilot flow rather than bypassing account/version checks. */
public final class AccountFixtures {
    private AccountFixtures() {
    }

    /** Registers a disposable invited account through the real HTTP flow and returns its cookies. */
    public static Cookie[] signedIn(MockMvc mvc, JdbcTemplate jdbc) throws Exception {
        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(UUID.randomUUID().toString().substring(0, 32).getBytes(StandardCharsets.UTF_8));
        String hash = HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, "
                + "expires_at) values (?, ?, now() - interval '1 minute', now() + " + "interval '1 hour')",
            UUID.randomUUID(),
            hash);
        Cookie csrf = mvc.perform(get("/api/v1/auth/csrf")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrf).isNotNull();
        var response = mvc
            .perform(
                post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
                    .cookie(csrf)
                    .header("X-XSRF-TOKEN", csrf.getValue())
                    .param("username", UUID.randomUUID().toString().replace("-", ""))
                    .param("password", "kanjii")
                    .param("invitation", token)
                    .param("privacy", "true")
                    .param("adult", "true"))
            .andReturn()
            .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getCookie("SESSION")).isNotNull();
        return new Cookie[] {response.getCookie("SESSION")};
    }
}
