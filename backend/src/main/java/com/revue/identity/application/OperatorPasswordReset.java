package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordPolicy;
import com.revue.identity.domain.Username;
import java.time.Clock;
import org.springframework.stereotype.Service;

/** Replaces the credentials of a pilot account after the operator verifies the learner's identity. */
@Service
public class OperatorPasswordReset {
    private final AccountQueries accounts;
    private final PasswordHasher hasher;
    private final PasswordResetStore store;
    private final Clock clock;

    /** Creates the operator use case with the same password rules and storage format as sign-in. */
    public OperatorPasswordReset(
        AccountQueries accounts,
        PasswordHasher hasher,
        PasswordResetStore store,
        Clock clock) {
        this.accounts = accounts;
        this.hasher = hasher;
        this.store = store;
        this.clock = clock;
    }

    /** Resets an active or quarantined username account and invalidates all prior credential versions. */
    public void reset(String rawUsername, String password) {
        Username username = new Username(rawUsername);
        PasswordPolicy.validate(password);
        var credentials = accounts.byUsername(username)
            .orElseThrow(() -> new IllegalStateException("No account matches that username"));
        Account account = credentials.account();
        Account.Access access = account.accessAt(clock.instant());
        if (access != Account.Access.ACTIVE && access != Account.Access.CREDENTIAL_RESET_REQUIRED) {
            throw new IllegalStateException("This account is ineligible for password recovery");
        }
        if (hasher.matches(password, credentials.hash())) {
            throw new IllegalArgumentException("Choose a password different from the current one");
        }
        if (!store.replace(account.id(), account.credentialVersion(), hasher.encode(password))) {
            throw new IllegalStateException("The account changed during recovery. Verify its state before retrying");
        }
    }
}
