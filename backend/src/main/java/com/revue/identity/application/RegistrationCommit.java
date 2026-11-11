package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short commit boundary. Hashing, token preparation and delivery belong outside this transaction. */
@Service
public class RegistrationCommit {
    private final RegistrationStore store;
    private final PilotInvitation pilotInvitation;

    /** Creates the registration transaction boundary with its store. */
    public RegistrationCommit(RegistrationStore store, PilotInvitation pilotInvitation) {
        this.store = store;
        this.pilotInvitation = pilotInvitation;
    }

    /** Atomically creates the username account and records redemption for single-use invitations. */
    @Transactional
    public Result registerUsername(UsernameRegistration prepared) {
        SignupInvite invite = null;
        if (pilotInvitation.isConfigured()) {
            if (!pilotInvitation.accepts(prepared.invitationHash())) {
                throw new RegistrationUnavailableException();
            }
        } else {
            invite = store.lockInvite(prepared.invitationHash()).orElseThrow(RegistrationUnavailableException::new);
        }
        Instant now = store.currentTime();
        Account account = Account.registerUsername(UUID.randomUUID(), prepared.username(), now);
        if (invite != null) {
            try {
                invite = invite.redeem(account.id(), now);
            } catch (IllegalStateException _) {
                throw new RegistrationUnavailableException();
            }
        }
        if (!store.insertUsernameAccount(account, prepared.passwordHash())) {
            throw new AccountProblem(
                AccountProblem.Kind.UNAVAILABLE_USERNAME,
                "That username is unavailable. Choose another or sign in");
        }
        if (invite != null) {
            store.saveRedemption(invite);
        }
        return new Result(account.id(), account.credentialVersion());
    }

    /** Prehashed credentials and invitation for a username registration. */
    public record UsernameRegistration(Username username, PasswordHash passwordHash, TokenHash invitationHash) {
        /** Validates the prepared username registration's required values. */
        public UsernameRegistration {
            Objects.requireNonNull(username);
            Objects.requireNonNull(passwordHash);
            Objects.requireNonNull(invitationHash);
        }
    }

    /** A committed registration, not authentication authority or a learner session. */
    public record Result(UUID accountId, long credentialVersion) {
    }
}
