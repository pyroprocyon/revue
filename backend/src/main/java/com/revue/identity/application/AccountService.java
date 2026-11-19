package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordPolicy;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Clock;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
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
        return eligibleAccount().profile();
    }

    /** Public navigation can check for an eligible session without requesting private access. */
    public boolean signedIn() {
        return currentAccount().isPresent();
    }

    public EligibleAccount eligibleAccount() {
        return currentAccount().orElseThrow(LoginCommit::rejected);
    }

    private Optional<EligibleAccount> currentAccount() {
        var current = session.current();
        if (current.isEmpty()) {
            return Optional.empty();
        }
        var eligible = eligible(current.get());
        if (eligible.isEmpty()) {
            session.clear();
        }
        return eligible;
    }

    private Optional<EligibleAccount> eligible(AccountSession.Identity identity) {
        Account account = accounts.byId(identity.accountId()).map(AccountQueries.Credentials::account).orElse(null);
        if (account == null
            || account.credentialVersion() != identity.credentialVersion()
            || account.accessAt(clock.instant()) != Account.Access.ACTIVE
            || account.username() == null) {
            return Optional.empty();
        }
        return Optional.of(new EligibleAccount(identity, new Profile(account.username().value())));
    }

    /**
     * Returns the form token with the learner it was issued for. An ineligible session is not cleared here, because
     * clearing also deletes the token cookie that this response hands out.
     */
    public FormToken csrf() {
        var learner = session.current().flatMap(this::eligible).map(account -> account.profile().username());
        var token = session.csrf();
        return new FormToken(token.token(), token.headerName(), learner.orElse(null));
    }

    /** Form token, its request header and the eligible learner it was issued for, with redacted diagnostic output. */
    public record FormToken(String token, String headerName, @Nullable String username) {
        @Override
        public String toString() {
            return "FormToken[redacted]";
        }
    }

    /** Account facts confirmed for this request, including the credential version checked for private access. */
    public record EligibleAccount(AccountSession.Identity identity, Profile profile) {
        public static final String REQUEST_ATTRIBUTE = "revue.eligibleAccount";
    }

    /** Public account details returned to the signed-in learner. */
    public record Profile(String username) {
    }
}
