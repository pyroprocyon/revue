package com.revue.identity.application;

import com.revue.identity.domain.PasswordHash;
import java.util.UUID;

/** Changes credentials only while the account is still eligible and at the expected version. */
public interface PasswordResetStore {
    /** Saves the new hash, advances the credential version and clears the restore-time reset requirement. */
    boolean replace(UUID accountId, long expectedVersion, PasswordHash replacement);
}
