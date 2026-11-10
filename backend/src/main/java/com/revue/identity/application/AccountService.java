package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordPolicy;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import org.springframework.stereotype.Service;

/** Coordinates invited registration, password verification and learner sessions. */
@Service
public class AccountService {
    public static final String PRIVACY_VERSION = "pilot-2026-11-09";
    private final AccountQueries accounts;
    private final RegistrationCommit registration;
    private final LoginCommit login;
    private final PasswordHasher hasher;
    private final AuthenticationAdmission admission;
    private final AccountSession session;
    private final Clock clock;

    /** Creates the account use cases with their persistence, hashing and session ports. */
    public AccountService(
            AccountQueries accounts,
            RegistrationCommit registration,
            LoginCommit login,
            PasswordHasher hasher,
            AuthenticationAdmission admission,
            AccountSession session,
            Clock clock) {
        this.accounts = accounts;
        this.registration = registration;
        this.login = login;
        this.hasher = hasher;
        this.admission = admission;
        this.session = session;
        this.clock = clock;
    }

    /** Validates signup, hashes the password and atomically redeems the invitation. */
    public Profile register(String rawUsername, String password, String invitation, boolean privacy, boolean adult) {
        Username username = new Username(rawUsername);
        PasswordPolicy.validate(password);
        if (!privacy || !adult) {
            throw new IllegalArgumentException("Confirm the privacy notice and that you are at least 18");
        }
        TokenHash invite = inviteHash(invitation);
        try (var permit = admission.enter(username.value())) {
            if (!accounts.inviteAvailable(invite, clock.instant())) {
                throw new IllegalArgumentException(
                        "Use a valid invitation link. If you already registered, sign in instead");
            }
            // The transaction starts only after hashing; invitations are locked and rechecked inside it.
            var result =
                    registration.registerUsername(
                            new RegistrationCommit.UsernameRegistration(
                                    username, hasher.encode(password), invite, PRIVACY_VERSION));
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
        } catch (IllegalArgumentException invalid) {
            throw LoginCommit.rejected();
        }
        try (var permit = admission.enter(username.value())) {
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

    private static TokenHash inviteHash(String invitation) {
        if (invitation == null || !invitation.matches("[A-Za-z0-9_-]{43}")) {
            throw new IllegalArgumentException("Use your invitation link to create an account");
        }
        try {
            return new TokenHash(
                    HexFormat.of()
                            .formatHex(
                                    MessageDigest.getInstance("SHA-256")
                                            .digest(invitation.getBytes(StandardCharsets.UTF_8))));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable", unavailable);
        }
    }

    /** Public account details returned to the signed-in learner. */
    public record Profile(String username) {}
}
