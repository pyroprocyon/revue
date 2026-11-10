package com.revue.identity.application;

import java.util.Optional;
import java.util.UUID;

/** Establishes and reads the learner session without exposing transport details. */
public interface AccountSession {
    /** Rotates authentication state and records the confirmed account identity. */
    void establish(Identity identity);

    /** Returns the identity stored in the current session, if present. */
    Optional<Identity> current();

    /** Invalidates the current authenticated session. */
    void clear();

    /** Returns the token and header needed for a same-origin state-changing request. */
    Csrf csrf();

    /** Account identity and the credential version proved when the session was established. */
    record Identity(UUID accountId, long credentialVersion) {}

    /** CSRF token and request header with redacted diagnostic output. */
    record Csrf(String token, String headerName) {
        @Override
        public String toString() {
            return "Csrf[redacted]";
        }
    }
}
