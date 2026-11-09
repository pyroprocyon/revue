package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.VerificationChallenge;
import java.util.Optional;

/** All methods run in the caller's transaction. The invite lock lasts until that transaction ends. */
public interface RegistrationStore {
	Optional<SignupInvite> lockInvite(TokenHash tokenHash);
	boolean insertPendingAccount(Account account, PasswordHash passwordHash);
	void saveRedemption(SignupInvite invite);
	boolean insertVerification(VerificationChallenge challenge);
}
