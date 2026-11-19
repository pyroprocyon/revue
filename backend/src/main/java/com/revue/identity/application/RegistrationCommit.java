package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.Username;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short commit boundary. Hashing, token preparation and delivery belong outside this transaction. */
@Service
public class RegistrationCommit {
    private final RegistrationStore store;

    public RegistrationCommit(RegistrationStore store) {
        this.store = store;
    }

    /** Atomically creates the username account. */
    @Transactional
    public Result registerUsername(UsernameRegistration prepared) {
        Account account = Account.registerUsername(UUID.randomUUID(), prepared.username(), store.currentTime());
        if (!store.insertUsernameAccount(account, prepared.passwordHash())) {
            throw new AccountProblem(
                AccountProblem.Kind.UNAVAILABLE_USERNAME,
                "That username is unavailable. Choose another or sign in");
        }
        return new Result(account.id(), account.credentialVersion());
    }

    /** Prehashed credentials for a username registration. */
    public record UsernameRegistration(Username username, PasswordHash passwordHash) {
        public UsernameRegistration {
            Objects.requireNonNull(username);
            Objects.requireNonNull(passwordHash);
        }
    }

    /** A committed registration, not authentication authority or a learner session. */
    public record Result(UUID accountId, long credentialVersion) {
    }
}
