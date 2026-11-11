package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordPolicy;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Clock;
import org.springframework.stereotype.Service;

/** Coordinates invited registration, password verification and learner sessions. */
@Service
public class AccountService {
    private final AccountQueries accounts;
    private final RegistrationCommit registration;
    private final LoginCommit login;
    private final PasswordHasher hasher;
    private final AuthenticationAdmission admission;
    private final AccountSession session;
    private final Clock clock;
    private final PilotInvitation pilotInvitation;

    /** Creates the account use cases with their persistence, hashing and session ports. */
    public AccountService(
        AccountQueries accounts,
        RegistrationCommit registration,
        LoginCommit login,
        PasswordHasher hasher,
        AuthenticationAdmission admission,
        AccountSession session,
        Clock clock,
        PilotInvitation pilotInvitation) {
        this.accounts = accounts;
        this.registration = registration;
        this.login = login;
        this.hasher = hasher;
        this.admission = admission;
        this.session = session;
        this.clock = clock;
        this.pilotInvitation = pilotInvitation;
    }

    /** Validates signup, hashes the password and creates an account using a valid invitation. */
    public Profile register(String rawUsername, String password, String invitation) {
        Username username = new Username(rawUsername);
        PasswordPolicy.validate(password);
        TokenHash invite = PilotInvitation.hash(invitation);
        try (var _ = admission.enter(username.value())) {
            boolean available = pilotInvitation.isConfigured()
                ? pilotInvitation.accepts(invite)
                : accounts.inviteAvailable(invite);
            if (!available) {
                throw new IllegalArgumentException(
                    "Use a valid invitation link. If you already registered, sign in instead");
            }
            // Hashing precedes the transaction; database invitations are locked and rechecked inside it.
            var result = registration.registerUsername(
                new RegistrationCommit.UsernameRegistration(username, hasher.encode(password), invite));
            session.establish(new AccountSession.Identity(result.accountId(), result.credentialVersion()));
            return current();
        }
    }

    /** Verifies credentials and establishes a session for the confirmed account version. */
    public Profile signIn(String rawUsername, String password) {
        Username username;
        try {
            username = new Username(rawUsername);
            PasswordPolicy.validateLength(password);
        } catch (IllegalArgumentException _) {
            throw LoginCommit.rejected();
        }
        try (var _ = admission.enter(username.value())) {
            var stored = accounts.byUsername(username);
            boolean matches = hasher.matches(password, stored.map(AccountQueries.Credentials::hash).orElse(null));
            if (stored.isEmpty() || !matches) {
                throw LoginCommit.rejected();
            }
            Account account = stored.get().account();
            session.establish(login.confirm(account.id(), account.credentialVersion()));
            return current();
        }
    }

    /** Returns the current eligible account or rejects an invalid session. */
    public Profile current() {
        var identity = session.current().orElseThrow(LoginCommit::rejected);
        var stored = accounts.byId(identity.accountId());
        if (stored.isEmpty()
            || stored.get().account().credentialVersion() != identity.credentialVersion()
            || stored.get().account().accessAt(clock.instant()) != Account.Access.ACTIVE) {
            session.clear();
            throw LoginCommit.rejected();
        }
        Account account = stored.get().account();
        if (account.username() == null) {
            session.clear();
            throw LoginCommit.rejected();
        }
        return new Profile(account.username().value());
    }

    /** Returns CSRF credentials through the session port. */
    public AccountSession.Csrf csrf() {
        return session.csrf();
    }

    /** Public account details returned to the signed-in learner. */
    public record Profile(String username) {
    }
}
