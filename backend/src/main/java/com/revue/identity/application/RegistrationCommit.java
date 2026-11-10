package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short commit boundary. Hashing, token preparation and delivery belong outside this transaction. */
@Service
public class RegistrationCommit {
    private final RegistrationStore store;
    private final Clock clock;

    /** Creates the registration transaction boundary with its store and clock. */
    public RegistrationCommit(RegistrationStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** Atomically creates the username account and redeems its invitation. */
    @Transactional
    public Result registerUsername(UsernameRegistration prepared) {
        SignupInvite invite =
                store.lockInvite(prepared.invitationHash()).orElseThrow(RegistrationUnavailableException::new);
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Account account =
                Account.registerUsername(UUID.randomUUID(), prepared.username(), prepared.privacyVersion(), now);
        SignupInvite redeemed;
        try {
            redeemed = invite.redeem(account.id(), now);
        } catch (IllegalStateException unavailable) {
            throw new RegistrationUnavailableException();
        }
        if (!store.insertUsernameAccount(account, prepared.passwordHash())) {
            throw new AccountProblem(
                    AccountProblem.Kind.UNAVAILABLE_USERNAME,
                    "That username is unavailable. Choose another or sign in");
        }
        store.saveRedemption(redeemed);
        return new Result(account.id(), account.credentialVersion());
    }

    /** Prehashed credentials, invitation and consent for a username registration. */
    public record UsernameRegistration(
            Username username, PasswordHash passwordHash, TokenHash invitationHash, String privacyVersion) {
        /** Validates the prepared username registration's required values. */
        public UsernameRegistration {
            Objects.requireNonNull(username);
            Objects.requireNonNull(passwordHash);
            Objects.requireNonNull(invitationHash);
            Objects.requireNonNull(privacyVersion);
        }
    }

    /** A committed registration, not authentication authority or a learner session. */
    public record Result(UUID accountId, long credentialVersion) {}
}
