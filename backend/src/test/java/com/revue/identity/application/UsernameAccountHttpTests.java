package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.revue.TestcontainersConfiguration;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = "revue.content.load-on-startup=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UsernameAccountHttpTests {
    @Autowired MockMvc mvc;

    @Autowired JdbcTemplate jdbc;

    @Test
    void sixCharacterSignupEstablishesRealSessionWithoutEmail() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String username = username();
        var response = browser.send(signup(username, "kanjii", invitation()));
        assertThat(response.getResponse().getStatus()).isEqualTo(200);
        assertThat(browser.send(get("/api/v1/me")).getResponse().getContentAsString()).contains(username);
        var row = jdbc.queryForMap("select * from users where username = ?", username);
        assertThat(row).containsEntry("email", null).containsEntry("email_verified_at", null);
        assertThat(row.get("password_hash").toString()).startsWith("{argon2id}$argon2id$").doesNotContain("kanjii");
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from auth_challenges where user_id = ?", Integer.class, row.get("id")))
                .isZero();
    }

    @Test
    void wrongAndUnknownCredentialsHaveTheSameResponse() throws Exception {
        String username = username();
        Browser owner = new Browser();
        owner.csrf();
        assertThat(owner.send(signup(username, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        Browser attacker = new Browser();
        attacker.csrf();
        var wrong = attacker.send(login(username, "wrongpass"));
        var unknown = attacker.send(login(username(), "wrongpass"));
        assertThat(wrong.getResponse().getStatus()).isEqualTo(401);
        assertThat(unknown.getResponse().getStatus()).isEqualTo(401);
        assertThat(wrong.getResponse().getContentAsString()).isEqualTo(unknown.getResponse().getContentAsString());
        assertThat(attacker.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void signInRotatesSessionAndCsrfAndLogoutInvalidatesAccess() throws Exception {
        String username = username();
        Browser browser = new Browser();
        browser.csrf();
        assertThat(browser.send(signup(username, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        final Cookie firstSession = browser.cookies.get("SESSION");
        browser.csrf();
        Cookie firstCsrf = browser.cookies.get("XSRF-TOKEN");
        assertThat(firstCsrf.isHttpOnly()).isTrue();
        assertThat(browser.send(login(username.toUpperCase(java.util.Locale.ROOT), "kanjii")).getResponse().getStatus())
                .isEqualTo(200);
        assertThat(browser.cookies.get("SESSION").getValue()).isNotEqualTo(firstSession.getValue());
        browser.csrf();
        assertThat(browser.cookies.get("XSRF-TOKEN").getValue()).isNotEqualTo(firstCsrf.getValue());
        assertThat(browser.send(post("/api/v1/auth/logout")).getResponse().getStatus()).isEqualTo(204);
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void staleVersionsSuspendedAndDeletedAccountsLosePrivateAccess() throws Exception {
        for (String change :
                new String[] {
                    "credential_version = credential_version + 1",
                    "suspended_at = now()",
                    "deletion_request_id = gen_random_uuid(), deletion_requested_at = "
                            + "now(), purge_after = now() + interval '7 days'"
                }) {
            String username = username();
            Browser browser = new Browser();
            browser.csrf();
            assertThat(browser.send(signup(username, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
            jdbc.update("update users set " + change + " where username = ?", username);
            assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        }
    }

    @Test
    void missingCsrfAndShortOrCommonPasswordsCannotRegister() throws Exception {
        assertThat(mvc.perform(signup(username(), "kanjii", invitation())).andReturn().getResponse().getStatus())
                .isEqualTo(403);
        Browser browser = new Browser();
        browser.csrf();
        for (String password : new String[] {"short", "123456", "a".repeat(65)}) {
            String username = username();
            assertThat(browser.send(signup(username, password, invitation())).getResponse().getStatus()).isEqualTo(400);
            assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
                    .isZero();
        }
    }

    @ParameterizedTest(name = "privacy={0}, adult={1}")
    @CsvSource({"false, true", "true, false"})
    void declinedConfirmationCannotCreateAccountOrConsumeInvite(boolean privacy, boolean adult) throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String username = username();
        String invite = invitation();
        var rejected = browser.send(signup(username, "kanjii", invite, privacy, adult));
        assertThat(rejected.getResponse().getStatus()).isEqualTo(400);
        assertThat(rejected.getResponse().getCookie("SESSION")).isNull();
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
                .isZero();
        assertThat(
                        jdbc.queryForMap(
                                "select redeemed_at, redeemed_by_user_id from signup_invites where token_hash = ?",
                                hash(invite)))
                .containsEntry("redeemed_at", null)
                .containsEntry("redeemed_by_user_id", null);
        // Accepting both confirmations can still use the original invitation and username.
        assertThat(browser.send(signup(username, "kanjii", invite)).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void duplicateUsernameNeverConsumesAnotherInviteOrSignsInTheRequester() throws Exception {
        String username = username();
        Browser owner = new Browser();
        owner.csrf();
        assertThat(owner.send(signup(username, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        String extra = invitation();
        Browser other = new Browser();
        other.csrf();
        assertThat(other.send(signup(username, "different", extra)).getResponse().getStatus()).isEqualTo(409);
        assertThat(other.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        assertThat(jdbc.queryForMap("select redeemed_at from signup_invites where token_hash = ?", hash(extra)))
                .containsEntry("redeemed_at", null);
    }

    private MockHttpServletRequestBuilder signup(String username, String password, String invite) {
        return signup(username, password, invite, true, true);
    }

    private MockHttpServletRequestBuilder signup(
            String username, String password, String invite, boolean privacy, boolean adult) {
        return post("/api/v1/auth/register")
                .contentType("application/x-www-form-urlencoded")
                .param("username", username)
                .param("password", password)
                .param("invitation", invite)
                .param("privacy", Boolean.toString(privacy))
                .param("adult", Boolean.toString(adult));
    }

    private MockHttpServletRequestBuilder login(String username, String password) {
        return post("/api/v1/auth/login")
                .contentType("application/x-www-form-urlencoded")
                .param("username", username)
                .param("password", password);
    }

    private String invitation() throws Exception {
        String token =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(
                                (UUID.randomUUID().toString()).substring(0, 32).getBytes(StandardCharsets.UTF_8));
        jdbc.update(
                "insert into signup_invites (id, token_hash, created_at, "
                        + "expires_at) values (?, ?, now() - interval '1 minute', now() + "
                        + "interval '1 hour')",
                UUID.randomUUID(),
                hash(token));
        return token;
    }

    private String hash(String token) throws Exception {
        return HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    }

    private String username() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private final class Browser {
        private final Map<String, Cookie> cookies = new HashMap<>();

        void csrf() throws Exception {
            send(get("/api/v1/auth/csrf"));
        }

        MvcResult send(MockHttpServletRequestBuilder request) throws Exception {
            if (!cookies.isEmpty()) {
                request.cookie(cookies.values().toArray(Cookie[]::new));
            }
            Cookie csrf = cookies.get("XSRF-TOKEN");
            if (csrf != null) {
                request.header("X-XSRF-TOKEN", csrf.getValue());
            }
            MvcResult result = mvc.perform(request).andReturn();
            for (Cookie cookie : result.getResponse().getCookies()) {
                if (cookie.getMaxAge() == 0) {
                    cookies.remove(cookie.getName());
                } else {
                    cookies.put(cookie.getName(), cookie);
                }
            }
            return result;
        }
    }
}
