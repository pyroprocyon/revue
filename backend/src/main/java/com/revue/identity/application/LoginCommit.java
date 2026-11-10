package com.revue.identity.application;

import com.revue.identity.domain.Account;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Rechecks account eligibility and the proved credential version under a database lock. */
@Service
public class LoginCommit {
    private final AccountQueries accounts;
    private final Clock clock;

    /** Creates the login transaction boundary with its account store and clock. */
    public LoginCommit(AccountQueries accounts, Clock clock) {
        this.accounts = accounts;
        this.clock = clock;
    }

    /** Confirms the exact credential version proved before entering the transaction. */
    @Transactional
    public AccountSession.Identity confirm(UUID accountId, long provedVersion) {
        Account account = accounts.lock(accountId).orElseThrow(LoginCommit::rejected).account();
        if (account.credentialVersion() != provedVersion
                || account.accessAt(clock.instant()) != Account.Access.ACTIVE) {
            throw rejected();
        }
        return new AccountSession.Identity(account.id(), provedVersion);
    }

    static AccountProblem rejected() {
        return new AccountProblem(AccountProblem.Kind.INVALID_CREDENTIALS, "Username or password is incorrect");
    }
}
