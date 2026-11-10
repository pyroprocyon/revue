package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Reads account credentials and locks accounts for transactional eligibility checks. */
public interface AccountQueries {
    /** Finds the account and encoded credentials for a canonical username. */
    Optional<Credentials> byUsername(Username username);

    /** Finds the account and encoded credentials for its stable identifier. */
    Optional<Credentials> byId(UUID id);

    /** Locks and returns an account's current credentials within the caller's transaction. */
    Optional<Credentials> lock(UUID id);

    /** Checks whether the invitation is available at the supplied time. */
    boolean inviteAvailable(TokenHash hash, Instant now);

    /** Account state and encoded credentials with redacted diagnostic output. */
    record Credentials(Account account, PasswordHash hash) {
        @Override
        public String toString() {
            return "Credentials[redacted]";
        }
    }
}
