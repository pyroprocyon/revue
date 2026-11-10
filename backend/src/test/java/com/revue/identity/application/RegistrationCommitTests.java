package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.TestcontainersConfiguration;
import com.revue.identity.domain.EmailAddress;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Instant;
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

@SpringBootTest(properties = "revue.content.load-on-startup=false")
@Import(TestcontainersConfiguration.class)
class RegistrationCommitTests {
    @Autowired RegistrationCommit registration;

    @Autowired JdbcTemplate jdbc;

    @Test
    void registrationCommitsOnePendingAccountInviteAndChallengeTogether() {
        TokenHash invite = invitation();
        var prepared = prepared(email(), invite, hash());
        var result = registration.register(prepared);
        var row = jdbc.queryForMap("select * from users where id = ?", result.accountId());
        assertThat(row)
                .containsEntry("email", prepared.email().value())
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
        var challenge = jdbc.queryForMap("select * from auth_challenges where user_id = ?", result.accountId());
        assertThat(challenge)
                .containsEntry("purpose", "VERIFY_EMAIL")
                .containsEntry("credential_version", 0L)
                .containsEntry("token_hash", prepared.verificationHash().value())
                .containsEntry("consumed_at", null);
        assertThat(challenge.get("created_at")).isEqualTo(row.get("created_at"));
    }

    @Test
    void concurrentRegistrationsCannotRedeemOneInviteTwice() throws Exception {
        TokenHash invite = invitation();
        var first = prepared(email(), invite, hash());
        var second = prepared(email(), invite, hash());
        assertOneWinner(() -> registration.register(first), () -> registration.register(second));
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from users where email in (?, ?)",
                                Integer.class,
                                first.email().value(),
                                second.email().value()))
                .isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from auth_challenges where token_hash in (?, ?)",
                                Integer.class,
                                first.verificationHash().value(),
                                second.verificationHash().value()))
                .isEqualTo(1);
    }

    @Test
    void canonicalEmailUniquenessHoldsAcrossConcurrentInvites() throws Exception {
        String email = email();
        var first = prepared(" \t" + email.toUpperCase(java.util.Locale.ROOT) + "\n", invitation(), hash());
        var second = prepared(email, invitation(), hash());
        assertOneWinner(() -> registration.register(first), () -> registration.register(second));
        assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email))
                .isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from signup_invites where token_hash in (?, ?) "
                                        + "and redeemed_at is not null",
                                Integer.class,
                                first.invitationHash().value(),
                                second.invitationHash().value()))
                .isEqualTo(1);
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
                                "select count(*) from signup_invites where token_hash in (?, ?) "
                                        + "and redeemed_at is not null",
                                Integer.class,
                                first.invitationHash().value(),
                                second.invitationHash().value()))
                .isEqualTo(1);
    }

    @Test
    void duplicateSignupCannotReplaceCredentialsOrConsumeAnotherInvitation() {
        String email = email();
        var original = registration.register(prepared(email, invitation(), hash()));
        TokenHash unused = invitation();
        var retry =
                new RegistrationCommit.PreparedRegistration(
                        new EmailAddress(email),
                        new PasswordHash("{test}replacement"),
                        unused,
                        hash(),
                        Instant.now().plusSeconds(300),
                        "pilot-v1",
                        true,
                        true);
        assertThatThrownBy(() -> registration.register(retry)).isInstanceOf(RegistrationUnavailableException.class);
        assertThat(
                        jdbc.queryForObject(
                                "select password_hash from users where id = ?", String.class, original.accountId()))
                .isEqualTo("{test}encoded-placeholder");
        assertThat(jdbc.queryForMap("select redeemed_at from signup_invites where token_hash = ?", unused.value()))
                .containsEntry("redeemed_at", null);
    }

    @Test
    void failureAfterAccountAndRedemptionWritesRollsBackBoth() {
        TokenHash collision = hash();
        registration.register(prepared(email(), invitation(), collision));
        TokenHash unused = invitation();
        String newEmail = email();
        assertThatThrownBy(() -> registration.register(prepared(newEmail, unused, collision)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, newEmail)).isZero();
        assertThat(
                        jdbc.queryForMap(
                                "select redeemed_at, redeemed_by_user_id from signup_invites where token_hash = ?",
                                unused.value()))
                .containsEntry("redeemed_at", null)
                .containsEntry("redeemed_by_user_id", null);
        // The same invite still works after the aborted transaction.
        assertThat(registration.register(prepared(newEmail, unused, hash())).accountId()).isNotNull();
    }

    @Test
    void removingAccountClearsInviteLinkButCannotRestoreItsUse() {
        TokenHash invite = invitation();
        var result = registration.register(prepared(email(), invite, hash()));
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
        assertThatThrownBy(() -> registration.register(prepared(email(), invite, hash())))
                .isInstanceOf(RegistrationUnavailableException.class);
    }

    @Test
    void missingExpiredAndRevokedInvitesCreateNoAccount() {
        TokenHash expired = invitation();
        TokenHash revoked = invitation();
        jdbc.update(
                "update signup_invites set created_at = now() - interval '2 "
                        + "days', expires_at = now() - interval '1 day' where token_hash = ?",
                expired.value());
        jdbc.update("update signup_invites set revoked_at = now() where token_hash = ?", revoked.value());
        for (TokenHash invalid : List.of(hash(), expired, revoked)) {
            String email = email();
            assertThatThrownBy(() -> registration.register(prepared(email, invalid, hash())))
                    .isInstanceOf(RegistrationUnavailableException.class);
            assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email))
                    .isZero();
        }
    }

    @Test
    void expiredPreparedChallengeCannotConsumeAnInvite() {
        TokenHash invite = invitation();
        var input =
                new RegistrationCommit.PreparedRegistration(
                        new EmailAddress(email()),
                        new PasswordHash("{test}encoded-placeholder"),
                        invite,
                        hash(),
                        Instant.now().minusSeconds(1),
                        "pilot-v1",
                        true,
                        true);
        assertThatIllegalArgumentException().isThrownBy(() -> registration.register(input));
        assertThat(jdbc.queryForMap("select redeemed_at from signup_invites where token_hash = ?", invite.value()))
                .containsEntry("redeemed_at", null);
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
            Callable<RegistrationCommit.Result> input, CountDownLatch ready, CountDownLatch start) {
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

    private RegistrationCommit.PreparedRegistration prepared(String email, TokenHash invite, TokenHash verification) {
        return new RegistrationCommit.PreparedRegistration(
                new EmailAddress(email),
                new PasswordHash("{test}encoded-placeholder"),
                invite,
                verification,
                Instant.now().plusSeconds(300),
                "pilot-v1",
                true,
                true);
    }

    private RegistrationCommit.UsernameRegistration usernamePrepared(String username, TokenHash invite) {
        return new RegistrationCommit.UsernameRegistration(
                new Username(username), new PasswordHash("{test}encoded-placeholder"), invite, "pilot-v1");
    }

    private TokenHash invitation() {
        TokenHash token = hash();
        jdbc.update(
                "insert into signup_invites (id, token_hash, created_at, "
                        + "expires_at) values (?, ?, now() - interval '1 minute', now() + "
                        + "interval '1 hour')",
                UUID.randomUUID(),
                token.value());
        return token;
    }

    private TokenHash hash() {
        return new TokenHash(
                UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""));
    }

    private String email() {
        return UUID.randomUUID() + "@example.com";
    }
}
