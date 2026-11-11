package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import com.revue.TestcontainersConfiguration;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@SpringBootTest(properties = "revue.content.load-on-startup=false")
@Import(TestcontainersConfiguration.class)
class RegistrationCommitTests {
    @Autowired
    RegistrationCommit registration;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoSpyBean
    RegistrationStore store;

    @Test
    void registrationCommitsUsernameAccountAndRedemptionWithoutEmailOrChallenge() {
        TokenHash invite = invitation();
        var prepared = usernamePrepared(username(), invite);
        var result = registration.registerUsername(prepared);
        var row = jdbc.queryForMap("select * from users where id = ?", result.accountId());
        assertThat(row).containsEntry("username", prepared.username().value())
            .containsEntry("email", null)
            .containsEntry("credential_version", 0L)
            .containsEntry("credential_reset_required", false)
            .containsEntry("privacy_notice_version", "pilot-v1")
            .containsEntry("email_verified_at", null)
            .containsEntry("deletion_request_id", null);
        assertThat(row.get("privacy_accepted_at")).isEqualTo(row.get("created_at"));
        assertThat(row.get("adult_confirmed_at")).isEqualTo(row.get("created_at"));
        assertThat(
            jdbc.queryForObject(
                "select redeemed_by_user_id from signup_invites where token_hash = ?",
                UUID.class,
                invite.value()))
            .isEqualTo(result.accountId());
        assertThat(
            jdbc.queryForObject(
                "select count(*) from auth_challenges where user_id = ?",
                Integer.class,
                result.accountId()))
            .isZero();
    }

    @Test
    void concurrentUsernameRegistrationsCannotRedeemOneInviteTwice() throws Exception {
        TokenHash invite = invitation();
        var first = usernamePrepared(UUID.randomUUID().toString().replace("-", ""), invite);
        var second = usernamePrepared(UUID.randomUUID().toString().replace("-", ""), invite);
        assertOneWinner(() -> registration.registerUsername(first), () -> registration.registerUsername(second));
        assertThat(
            jdbc.queryForObject(
                "select count(*) from users where username in (?, ?)",
                Integer.class,
                first.username().value(),
                second.username().value()))
            .isEqualTo(1);
    }

    @Test
    void canonicalUsernameUniquenessHoldsAcrossConcurrentInvites() throws Exception {
        String username = UUID.randomUUID().toString().replace("-", "");
        var first = usernamePrepared(" " + username.toUpperCase(java.util.Locale.ROOT) + " ", invitation());
        var second = usernamePrepared(username, invitation());
        assertOneWinner(() -> registration.registerUsername(first), () -> registration.registerUsername(second));
        assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
            .isEqualTo(1);
        assertThat(
            jdbc.queryForObject(
                "select count(*) from signup_invites where token_hash in (?, ?) " + "and redeemed_at is not null",
                Integer.class,
                first.invitationHash().value(),
                second.invitationHash().value()))
            .isEqualTo(1);
    }

    @Test
    void duplicateSignupCannotReplaceCredentialsOrConsumeAnotherInvitation() {
        String name = username();
        var original = registration.registerUsername(usernamePrepared(name, invitation()));
        TokenHash unused = invitation();
        var retry = new RegistrationCommit.UsernameRegistration(
            new Username(name),
            new PasswordHash("{test}replacement"),
            unused,
            "pilot-v1");
        assertThatThrownBy(() -> registration.registerUsername(retry)).isInstanceOfSatisfying(
            AccountProblem.class,
            problem -> assertThat(problem.kind()).isEqualTo(AccountProblem.Kind.UNAVAILABLE_USERNAME));
        assertThat(
            jdbc.queryForObject("select password_hash from users where id = ?", String.class, original.accountId()))
            .isEqualTo("{test}encoded-placeholder");
        assertThat(jdbc.queryForMap("select redeemed_at from signup_invites where token_hash = ?", unused.value()))
            .containsEntry("redeemed_at", null);
    }

    @Test
    void failureAfterAccountAndRedemptionWritesRollsBackBoth() {
        TokenHash unused = invitation();
        String name = username();
        var prepared = usernamePrepared(name, unused);
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("Failure after the registration writes");
        }).when(store).saveRedemption(any());
        try {
            assertThatThrownBy(() -> registration.registerUsername(prepared))
                .hasRootCauseInstanceOf(IllegalStateException.class);
        } finally {
            reset(store);
        }
        assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, name)).isZero();
        assertThat(
            jdbc.queryForMap(
                "select redeemed_at, redeemed_by_user_id from signup_invites where token_hash = ?",
                unused.value()))
            .containsEntry("redeemed_at", null)
            .containsEntry("redeemed_by_user_id", null);
        assertThat(registration.registerUsername(prepared).accountId()).isNotNull();
    }

    @Test
    void removingAccountClearsInviteLinkButCannotRestoreItsUse() {
        TokenHash invite = invitation();
        var result = registration.registerUsername(usernamePrepared(username(), invite));
        // Retain deletion compatibility with the shipped challenge table, without creating email accounts.
        jdbc.update(
            "insert into auth_challenges (id, user_id, purpose, token_hash, credential_version, created_at, "
                + "expires_at) values (?, ?, 'VERIFY_EMAIL', ?, 0, now(), now() + interval '1 hour')",
            UUID.randomUUID(),
            result.accountId(),
            hash().value());
        jdbc.update("delete from users where id = ?", result.accountId());
        assertThat(
            jdbc.queryForObject(
                "select count(*) from auth_challenges where user_id = ?",
                Integer.class,
                result.accountId()))
            .isZero();
        assertThat(
            jdbc.queryForMap(
                "select redeemed_at, redeemed_by_user_id from signup_invites where token_hash = ?",
                invite.value()))
            .containsEntry("redeemed_by_user_id", null)
            .doesNotContainEntry("redeemed_at", null);
        assertThatThrownBy(() -> registration.registerUsername(usernamePrepared(username(), invite)))
            .isInstanceOf(RegistrationUnavailableException.class);
    }

    @Test
    void missingExpiredAndRevokedInvitesCreateNoAccount() {
        TokenHash expired = invitation();
        TokenHash revoked = invitation();
        jdbc.update(
            "update signup_invites set created_at = now() - interval '2 days', "
                + "expires_at = now() - interval '1 day' where token_hash = ?",
            expired.value());
        jdbc.update("update signup_invites set revoked_at = now() where token_hash = ?", revoked.value());
        for (TokenHash invalid : List.of(hash(), expired, revoked)) {
            String name = username();
            assertThatThrownBy(() -> registration.registerUsername(usernamePrepared(name, invalid)))
                .isInstanceOf(RegistrationUnavailableException.class);
            assertThat(jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, name))
                .isZero();
        }
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
            } catch (RegistrationUnavailableException expected) {
                return false;
            } catch (AccountProblem problem) {
                if (problem.kind() != AccountProblem.Kind.UNAVAILABLE_USERNAME) {
                    throw problem;
                }
                return false;
            }
        };
    }

    private RegistrationCommit.UsernameRegistration usernamePrepared(String username, TokenHash invite) {
        return new RegistrationCommit.UsernameRegistration(
            new Username(username),
            new PasswordHash("{test}encoded-placeholder"),
            invite,
            "pilot-v1");
    }

    private TokenHash invitation() {
        TokenHash token = hash();
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, "
                + "expires_at) values (?, ?, now() - interval '1 minute', now() + " + "interval '1 hour')",
            UUID.randomUUID(),
            token.value());
        return token;
    }

    private TokenHash hash() {
        return new TokenHash(
            UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""));
    }

    private String username() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
