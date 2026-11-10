package com.revue.identity.application;

import com.revue.identity.domain.PasswordHash;
import org.jspecify.annotations.Nullable;

/** Encodes and verifies passwords independently of persistence and HTTP sessions. */
public interface PasswordHasher {
    /** Encodes a password for storage using the configured one-way hash. */
    PasswordHash encode(String password);

    /** Checks the password against the stored hash, including the missing-account path. */
    boolean matches(String password, @Nullable PasswordHash hash);
}
