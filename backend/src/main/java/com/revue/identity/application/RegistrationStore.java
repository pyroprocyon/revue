package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import java.time.Instant;

/** All methods run in the caller's transaction. */
public interface RegistrationStore {
    /** Reads the database wall clock. */
    Instant currentTime();

    /** Inserts a username account, returning false when its identity is unavailable. */
    boolean insertUsernameAccount(Account account, PasswordHash passwordHash);
}
