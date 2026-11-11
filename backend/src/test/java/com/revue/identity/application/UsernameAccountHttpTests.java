package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.revue.TestcontainersConfiguration;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = "revue.content.publish=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UsernameAccountHttpTests {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @MockitoSpyBean
    AccountQueries accounts;
    @MockitoSpyBean
    PasswordHasher hasher;
    @MockitoSpyBean
    AccountSession session;
    @Autowired
    AuthenticationAdmission admission;
    @Autowired
    HikariDataSource pool;
    @Autowired
    MeterRegistry metrics;

    @ParameterizedTest
    @ValueSource(ints = {6, 16})
    void theSharedPilotInvitationAdmitsDifferentAccountsUntilRevokedOrExpired(int tokenBytes) throws Exception {
        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(UUID.randomUUID().toString().substring(0, tokenBytes).getBytes(StandardCharsets.UTF_8));
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, expires_at, reusable) "
                + "values (?, ?, now() - interval '1 minute', now() + interval '1 hour', true)",
            UUID.randomUUID(),
            hash(token));
        try {
            for (int attempt = 0; attempt < 2; attempt++) {
                Browser learner = new Browser();
                learner.csrf();
                String name = username();
                assertThat(learner.send(signup(name, "kanjii", token)).getResponse().getStatus()).isEqualTo(200);
                assertThat(learner.send(get("/api/v1/me")).getResponse().getContentAsString()).contains(name);
            }
            assertThat(
                jdbc.queryForMap(
                    "select redeemed_at, redeemed_by_user_id from signup_invites where token_hash = ?",
                    hash(token)))
                .containsEntry("redeemed_at", null)
                .containsEntry("redeemed_by_user_id", null);
            Browser rejected = new Browser();
            rejected.csrf();
            jdbc.update("update signup_invites set revoked_at = now() where token_hash = ?", hash(token));
            assertThat(rejected.send(signup(username(), "kanjii", token)).getResponse().getStatus()).isEqualTo(400);
            jdbc.update(
                "update signup_invites set revoked_at = null, expires_at = now() - interval '1 second' where"
                    + " token_hash = ?",
                hash(token));
            assertThat(rejected.send(signup(username(), "kanjii", token)).getResponse().getStatus()).isEqualTo(400);
            assertThat(rejected.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        } finally {
            jdbc.update("update signup_invites set revoked_at = now() where token_hash = ?", hash(token));
        }
    }

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
            jdbc.queryForObject("select count(*) from auth_challenges where user_id = ?", Integer.class, row.get("id")))
            .isZero();
    }

    @Test
    void currentProfileUsesOneAuthoritativeAccountReadPerRequest() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        final UUID id = jdbc.queryForObject("select id from users where username = ?", UUID.class, name);
        clearInvocations(accounts);
        var response = browser.send(get("/api/v1/me")).getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).isEqualTo("{\"username\":\"" + name + "\"}");
        verify(accounts, times(1)).byId(id);
        jdbc.update("update users set credential_version = credential_version + 1 where id = ?", id);
        var stale = browser.send(get("/api/v1/me")).getResponse();
        assertThat(stale.getStatus()).isEqualTo(401);
        assertThat(stale.getContentAsString()).isEmpty();
        verify(accounts, times(2)).byId(id);
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
        for (String change : new String[] {"credential_version = credential_version + 1", "suspended_at = now()",
            "credential_reset_required = true", "deletion_request_id = gen_random_uuid(), deletion_requested_at = "
                + "now(), purge_after = now() + interval '7 days'"}) {
            String username = username();
            Browser browser = new Browser();
            browser.csrf();
            assertThat(browser.send(signup(username, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
            jdbc.update("update users set " + change + " where username = ?", username);
            assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        }
    }

    @Test
    void credentialsChangedAfterPasswordProofCannotCreateLearnerSession() throws Exception {
        Browser owner = new Browser();
        owner.csrf();
        String name = username();
        assertThat(owner.send(signup(name, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        Browser returning = new Browser();
        returning.csrf();
        doAnswer(invocation -> {
            Object matched = invocation.callRealMethod();
            // Commit a credential change after hashing but before the login transaction checks the
            // version.
            jdbc.update("update users set credential_version = credential_version + 1 where username = ?", name);
            return matched;
        }).when(hasher).matches(anyString(), any());
        try {
            assertThat(returning.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(401);
        } finally {
            reset(hasher);
        }
        assertThat(returning.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        assertThat(returning.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void credentialChangeAfterSessionEstablishmentIsRejectedAndClearsTheSession() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        browser.csrf();
        doAnswer(invocation -> {
            invocation.callRealMethod();
            jdbc.update("update users set credential_version = credential_version + 1 where username = ?", name);
            return null;
        }).when(session).establish(any());
        try {
            assertThat(browser.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(401);
        } finally {
            reset(session);
        }
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void unavailableAdmissionStorageReturnsRetryFeedbackAndReleasesItsPermit() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        var unavailable = metrics.counter("revue.authentication.admission", "result", "store_unavailable");
        double before = unavailable.count();
        var held = new ArrayList<Connection>();
        String name = username();
        try {
            for (int i = 0; i < pool.getMaximumPoolSize(); i++) {
                held.add(pool.getConnection());
            }
            var rejected = browser.send(login(name, "kanjii")).getResponse();
            assertThat(rejected.getStatus()).isEqualTo(429);
            assertThat(rejected.getHeader("Retry-After")).isEqualTo("60");
            assertThat(unavailable.count()).isEqualTo(before + 1);
        } finally {
            for (var connection : held) {
                connection.close();
            }
        }
        assertThat(browser.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void overlappingAuthenticationReturnsRetryFeedbackAndCanSucceedAfterRelease() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii", invitation())).getResponse().getStatus()).isEqualTo(200);
        browser.csrf();
        try (var permit = admission.enter("other-operation")) {
            var rejected = browser.send(login(name, "kanjii")).getResponse();
            assertThat(rejected.getStatus()).isEqualTo(429);
            assertThat(rejected.getHeader("Retry-After")).isEqualTo("60");
        }
        assertThat(browser.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
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

    @Test
    void olderSignupFormsCanStillRegisterWithoutConfirmations() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        var request = signup(username(), "kanjii", invitation()).param("privacy", "false").param("adult", "false");
        assertThat(browser.send(request).getResponse().getStatus()).isEqualTo(200);
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(200);
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
        return post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
            .param("username", username)
            .param("password", password)
            .param("invitation", invite);
    }

    private MockHttpServletRequestBuilder login(String username, String password) {
        return post("/api/v1/auth/login").contentType("application/x-www-form-urlencoded")
            .param("username", username)
            .param("password", password);
    }

    private String invitation() throws Exception {
        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString((UUID.randomUUID().toString()).substring(0, 32).getBytes(StandardCharsets.UTF_8));
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, "
                + "expires_at) values (?, ?, now() - interval '1 minute', now() + " + "interval '1 hour')",
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
