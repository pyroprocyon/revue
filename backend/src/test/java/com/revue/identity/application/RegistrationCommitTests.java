package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.Username;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(properties = "revue.content.publish=false")
@Import(TestcontainersConfiguration.class)
class RegistrationCommitTests {
    @Autowired
    RegistrationCommit registration;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoSpyBean
    RegistrationStore store;

    @Test
    void registrationCommitsUsernameAccountWithoutEmailOrChallenge() {
        var prepared = usernamePrepared(username());
        var result = registration.registerUsername(prepared);
        var row = jdbc.queryForMap("select * from users where id = ?", result.accountId());
        assertThat(row).containsEntry("username", prepared.username().value())
            .containsEntry("email", null)
            .containsEntry("credential_version", 0L)
            .containsEntry("credential_reset_required", false)
            .containsEntry("privacy_notice_version", null)
            .containsEntry("email_verified_at", null)
            .containsEntry("deletion_request_id", null);
        assertThat(row.get("privacy_accepted_at")).isNull();
        assertThat(row.get("adult_confirmed_at")).isNull();
        assertThat(
            jdbc.queryForObject(
                "select count(*) from auth_challenges where user_id = ?",
                Integer.class,
                result.accountId()))
            .isZero();
    }

    @Test
    void canonicalUsernameUniquenessHoldsAcrossConcurrentRegistrations() throws Exception {
        String username = UUID.randomUUID().toString().replace("-", "");
        var first = usernamePrepared(" " + username.toUpperCase(java.util.Locale.ROOT) + " ");
        var second = usernamePrepared(username);
        assertOneWinner(() -> registration.registerUsername(first), () -> registration.registerUsername(second));
        assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
            .isEqualTo(1);
    }

    @Test
    void duplicateSignupCannotReplaceCredentials() {
        String name = username();
        var original = registration.registerUsername(usernamePrepared(name));
        var retry = new RegistrationCommit.UsernameRegistration(
            new Username(name),
            new PasswordHash("{test}replacement"));
        assertThatThrownBy(() -> registration.registerUsername(retry)).isInstanceOfSatisfying(
            AccountProblem.class,
            problem -> assertThat(problem.kind()).isEqualTo(AccountProblem.Kind.UNAVAILABLE_USERNAME));
        assertThat(
            jdbc.queryForObject("select password_hash from users where id = ?", String.class, original.accountId()))
            .isEqualTo("{test}encoded-placeholder");
    }

    @Test
    void failureAfterAccountInsertRollsBackRegistration(CapturedOutput output) {
        String name = username();
        var prepared = usernamePrepared(name);
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("Failure after the registration writes");
        }).when(store).insertUsernameAccount(any(), any());
        try {
            assertThatThrownBy(() -> registration.registerUsername(prepared))
                .hasRootCauseInstanceOf(IllegalStateException.class);
        } finally {
            reset(store);
        }
        assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, name)).isZero();
        assertThat(StructuredEvents.named(output, "account.created")).isEmpty();
        assertThat(registration.registerUsername(prepared).accountId()).isNotNull();
        assertThat(StructuredEvents.named(output, "account.created")).hasSize(1);
    }

    @Test
    void removingAccountClearsLegacyChallenges() {
        var result = registration.registerUsername(usernamePrepared(username()));
        // Retain deletion compatibility with the shipped challenge table, without creating email accounts.
        jdbc.update(
            "insert into auth_challenges (id, user_id, purpose, token_hash, credential_version, created_at, "
                + "expires_at) values (?, ?, 'VERIFY_EMAIL', ?, 0, now(), now() + interval '1 hour')",
            UUID.randomUUID(),
            result.accountId(),
            "a".repeat(64));
        jdbc.update("delete from users where id = ?", result.accountId());
        assertThat(
            jdbc.queryForObject(
                "select count(*) from auth_challenges where user_id = ?",
                Integer.class,
                result.accountId()))
            .isZero();
    }

    private void assertOneWinner(Callable<RegistrationCommit.Result> first, Callable<RegistrationCommit.Result> second)
        throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(contender(first, ready, start));
            var b = executor.submit(contender(second, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
        } finally {
            start.countDown();
        }
    }

    private Callable<Boolean> contender(
        Callable<RegistrationCommit.Result> input,
        CountDownLatch ready,
        CountDownLatch start) {
        return () -> {
            ready.countDown();
            if (!start.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent test did not start");
            }
            try {
                input.call();
                return true;
            } catch (AccountProblem problem) {
                if (problem.kind() != AccountProblem.Kind.UNAVAILABLE_USERNAME) {
                    throw problem;
                }
                return false;
            }
        };
    }

    private RegistrationCommit.UsernameRegistration usernamePrepared(String username) {
        return new RegistrationCommit.UsernameRegistration(
            new Username(username),
            new PasswordHash("{test}encoded-placeholder"));
    }

    private String username() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
