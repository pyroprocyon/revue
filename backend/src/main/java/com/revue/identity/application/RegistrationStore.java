package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import java.util.Optional;

/** All methods run in the caller's transaction. The invite lock lasts until that transaction ends. */
public interface RegistrationStore {
    /** Locks an invitation for validation and redemption in the caller's transaction. */
    Optional<SignupInvite> lockInvite(TokenHash tokenHash);

    /** Inserts a username account, returning false when its identity is unavailable. */
    boolean insertUsernameAccount(Account account, PasswordHash passwordHash);

    /** Persists the invitation's redemption within the registration transaction. */
    void saveRedemption(SignupInvite invite);
}
