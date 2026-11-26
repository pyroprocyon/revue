package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.Cookie;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.postgresql.util.PSQLException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(OutputCaptureExtension.class)
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
    @Autowired
    OperatorPasswordReset passwordReset;

    @Test
    void accountEventsCorrelateWithoutLeakingCredentialsOrAcceptingCallerIds(CapturedOutput output) throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        String password = "secret-password-sentinel";
        String forgedId = "caller-supplied-request-id";
        var registered = browser.send(signup(name, password).header("X-Request-Id", forgedId));
        assertThat(registered.getResponse().getStatus()).isEqualTo(200);
        final String sessionCookie = registered.getResponse().getCookie("SESSION").getValue();

        var created = StructuredEvents.named(output, "account.created").getFirst();
        var signedIn = StructuredEvents.named(output, "auth.register").getFirst();
        String operationId = signedIn.at("/operation/id").asString();
        assertThat(UUID.fromString(operationId)).isNotNull();
        assertThat(created.at("/operation/id").asString()).isEqualTo(operationId);
        assertThat(signedIn.at("/state/to").asString()).isEqualTo("authenticated");

        browser.csrf();
        assertThat(browser.send(post("/api/v1/auth/logout")).getResponse().getStatus()).isEqualTo(204);
        browser.csrf();
        assertThat(browser.send(post("/api/v1/auth/logout")).getResponse().getStatus()).isEqualTo(204);
        assertThat(StructuredEvents.named(output, "auth.logout"))
            .extracting(event -> event.at("/event/outcome").asString())
            .containsExactly("success", "no_change");

        browser.csrf();
        assertThat(browser.send(login(name, "invalid-password-sentinel\r\n")).getResponse().getStatus()).isEqualTo(401);
        assertThat(StructuredEvents.named(output, "auth.login")).singleElement().satisfies(event -> {
            assertThat(event.at("/event/outcome").asString()).isEqualTo("rejected");
            assertThat(event.at("/operation/id").asString()).isNotBlank().isNotEqualTo(operationId);
        });
        assertThat(output.getOut())
            .doesNotContain(name, password, sessionCookie, forgedId, "invalid-password-sentinel");
    }

    @Test
    void sessionStoreFailureLeavesAccountCommitVisibleWithoutSessionSuccess(CapturedOutput output) throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        jdbc.execute("ALTER TABLE spring_session ADD CONSTRAINT reject_session_save CHECK (false) NOT VALID");
        try {
            assertThatThrownBy(() -> browser.send(signup(name, "kanjii"))).hasRootCauseInstanceOf(PSQLException.class);
        } finally {
            jdbc.execute("ALTER TABLE spring_session DROP CONSTRAINT reject_session_save");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE username = ?", Integer.class, name))
            .isEqualTo(1);
        assertThat(StructuredEvents.named(output, "account.created")).hasSize(1);
        assertThat(StructuredEvents.named(output, "auth.register")).singleElement()
            .satisfies(event -> assertThat(event.at("/event/outcome").asString()).isEqualTo("failure"));
    }

    @Test
    void sixCharacterSignupEstablishesRealSessionWithoutEmail() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String username = username();
        var response = browser.send(signup(username, "kanjii"));
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
    void publicSessionStatusChecksEligibilityWithoutLoggingAnAccessDenial(CapturedOutput output) throws Exception {
        Browser browser = new Browser();
        var guest = browser.send(get("/api/v1/auth/session")).getResponse();
        assertThat(guest.getStatus()).isEqualTo(200);
        assertThat(guest.getContentAsString()).isEqualTo("{\"signedIn\":false}");
        assertThat(guest.getHeader("Cache-Control")).contains("no-store", "private");
        assertThat(guest.getCookie("SESSION")).isNull();
        browser.csrf();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        var signedIn = browser.send(get("/api/v1/auth/session")).getResponse();
        assertThat(signedIn.getStatus()).isEqualTo(200);
        assertThat(signedIn.getContentAsString()).isEqualTo("{\"signedIn\":true}");
        jdbc.update("update users set credential_version = credential_version + 1 where username = ?", name);
        var stale = browser.send(get("/api/v1/auth/session")).getResponse();
        assertThat(stale.getStatus()).isEqualTo(200);
        assertThat(stale.getContentAsString()).isEqualTo("{\"signedIn\":false}");
        assertThat(StructuredEvents.named(output, "auth.access_denied")).isEmpty();
        assertThat(StructuredEvents.named(output, "auth.session_invalidated")).hasSize(1);
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void formTokenNamesItsLearnerAndLeavesAnIneligibleSessionForTheAccountCheck(CapturedOutput output)
        throws Exception {
        Browser browser = new Browser();
        var json = JsonMapper.builder().build();
        assertThat(json.readTree(browser.csrf().getResponse().getContentAsString()).get("username").isNull()).isTrue();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        assertThat(json.readTree(browser.csrf().getResponse().getContentAsString()).get("username").asString())
            .isEqualTo(name);

        jdbc.update("update users set credential_version = credential_version + 1 where username = ?", name);
        var stale = browser.csrf().getResponse();
        var token = json.readTree(stale.getContentAsString());
        assertThat(token.get("username").isNull()).isTrue();
        assertThat(token.get("token").asString()).isEqualTo(browser.cookies.get("XSRF-TOKEN").getValue());
        assertThat(StructuredEvents.named(output, "auth.session_invalidated")).isEmpty();
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void currentProfileUsesOneAuthoritativeAccountReadPerRequest(CapturedOutput output) throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        String name = username();
        assertThat(browser.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        final UUID id = jdbc.queryForObject("select id from users where username = ?", UUID.class, name);
        clearInvocations(accounts);
        var response = browser.send(get("/api/v1/me")).getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).isEqualTo("{\"username\":\"" + name + "\"}");
        verify(accounts, times(1)).sessionUsername(id, 0);
        jdbc.update("update users set credential_version = credential_version + 1 where id = ?", id);
        var stale = browser.send(get("/api/v1/me")).getResponse();
        assertThat(stale.getStatus()).isEqualTo(401);
        assertThat(stale.getContentAsString()).isEmpty();
        verify(accounts, times(2)).sessionUsername(id, 0);
        var invalidation = StructuredEvents.named(output, "auth.session_invalidated");
        assertThat(invalidation).singleElement()
            .satisfies(event -> assertThat(event.at("/state/to").asString()).isEqualTo("invalidated"));
        assertThat(StructuredEvents.named(output, "auth.access_denied")).singleElement().satisfies(event -> {
            assertThat(event.at("/event/outcome").asString()).isEqualTo("rejected");
            assertThat(event.at("/http/response/status_code").asInt()).isEqualTo(401);
            assertThat(event.at("/operation/id").asString())
                .isEqualTo(invalidation.getFirst().at("/operation/id").asString());
        });
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void operatorResetRestoresAccessAndInvalidatesTheOldPasswordAndSession(boolean quarantined, CapturedOutput output)
        throws Exception {
        String name = username();
        Browser learner = new Browser();
        learner.csrf();
        assertThat(learner.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        var id = jdbc.queryForObject("select id from users where username = ?", UUID.class, name);
        if (quarantined) {
            jdbc.update("update users set credential_reset_required = true where id = ?", id);
        }

        assertThatThrownBy(() -> passwordReset.reset(name, "kanjii")).isInstanceOf(IllegalArgumentException.class);
        passwordReset.reset(name, "sampaguita");

        assertThat(learner.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        assertThat(learner.cookies).doesNotContainKey("SESSION");
        learner.csrf();
        assertThat(learner.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(401);
        assertThat(learner.send(login(name, "sampaguita")).getResponse().getStatus()).isEqualTo(200);
        assertThat(learner.send(get("/api/v1/me")).getResponse().getContentAsString()).contains(name);
        assertThat(jdbc.queryForMap("select credential_version, credential_reset_required from users where id = ?", id))
            .containsEntry("credential_version", 1L)
            .containsEntry("credential_reset_required", false);
        assertThat(StructuredEvents.named(output, "account.password_reset")).singleElement().satisfies(event -> {
            assertThat(event.at("/entity/id").asString()).isEqualTo(id.toString());
            assertThat(event.at("/state/from").asLong()).isZero();
            assertThat(event.at("/state/to").asLong()).isEqualTo(1);
        });
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void operatorResetCannotChangeSuspendedAccountsOrAccountsPendingDeletion(boolean deletionPending) throws Exception {
        String name = username();
        Browser learner = new Browser();
        learner.csrf();
        assertThat(learner.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        if (deletionPending) {
            jdbc.update(
                "update users set deletion_request_id = gen_random_uuid(), deletion_requested_at = now(), "
                    + "purge_after = now() + interval '7 days' where username = ?",
                name);
        } else {
            jdbc.update("update users set suspended_at = now() where username = ?", name);
        }

        assertThatThrownBy(() -> passwordReset.reset(name, "sampaguita")).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("select credential_version from users where username = ?", Long.class, name))
            .isZero();
    }

    @Test
    void wrongAndUnknownCredentialsHaveTheSameResponse() throws Exception {
        String username = username();
        Browser owner = new Browser();
        owner.csrf();
        assertThat(owner.send(signup(username, "kanjii")).getResponse().getStatus()).isEqualTo(200);
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
        assertThat(browser.send(signup(username, "kanjii")).getResponse().getStatus()).isEqualTo(200);
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
            "credential_reset_required = true",
            "deletion_request_id = gen_random_uuid(), deletion_requested_at = "
                + "now(), purge_after = now() + interval '7 days'",
            "email = username || '@example.org', username = null, email_verified_at = now(), "
                + "privacy_accepted_at = now(), privacy_notice_version = 'pilot', adult_confirmed_at = now()"}) {
            String username = username();
            Browser browser = new Browser();
            browser.csrf();
            assertThat(browser.send(signup(username, "kanjii")).getResponse().getStatus()).isEqualTo(200);
            jdbc.update("update users set " + change + " where username = ?", username);
            assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
        }
    }

    @Test
    void credentialsChangedAfterPasswordProofCannotCreateLearnerSession() throws Exception {
        Browser owner = new Browser();
        owner.csrf();
        String name = username();
        assertThat(owner.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
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
        assertThat(browser.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
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
        assertThat(browser.send(signup(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        browser.csrf();
        try (var _ = admission.enter("other-operation")) {
            var rejected = browser.send(login(name, "kanjii")).getResponse();
            assertThat(rejected.getStatus()).isEqualTo(429);
            assertThat(rejected.getHeader("Retry-After")).isEqualTo("60");
        }
        assertThat(browser.send(login(name, "kanjii")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void missingCsrfAndShortOrCommonPasswordsCannotRegister() throws Exception {
        assertThat(mvc.perform(signup(username(), "kanjii")).andReturn().getResponse().getStatus()).isEqualTo(403);
        Browser browser = new Browser();
        browser.csrf();
        for (String password : new String[] {"short", "123456", "a".repeat(65)}) {
            String username = username();
            assertThat(browser.send(signup(username, password)).getResponse().getStatus()).isEqualTo(400);
            assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
                .isZero();
        }
    }

    @Test
    void olderSignupFormsCanStillRegisterWithoutConfirmations() throws Exception {
        Browser browser = new Browser();
        browser.csrf();
        var request = signup(username(), "kanjii").param("privacy", "false").param("adult", "false");
        assertThat(browser.send(request).getResponse().getStatus()).isEqualTo(200);
        assertThat(browser.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void duplicateUsernameNeverSignsInTheRequester() throws Exception {
        String username = username();
        Browser owner = new Browser();
        owner.csrf();
        assertThat(owner.send(signup(username, "kanjii")).getResponse().getStatus()).isEqualTo(200);
        Browser other = new Browser();
        other.csrf();
        assertThat(other.send(signup(username, "different")).getResponse().getStatus()).isEqualTo(409);
        assertThat(other.send(get("/api/v1/me")).getResponse().getStatus()).isEqualTo(401);
    }

    private MockHttpServletRequestBuilder signup(String username, String password) {
        return post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
            .param("username", username)
            .param("password", password);
    }

    private MockHttpServletRequestBuilder login(String username, String password) {
        return post("/api/v1/auth/login").contentType("application/x-www-form-urlencoded")
            .param("username", username)
            .param("password", password);
    }

    private String username() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private final class Browser {
        private final Map<String, Cookie> cookies = new HashMap<>();

        MvcResult csrf() throws Exception {
            return send(get("/api/v1/auth/csrf"));
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
