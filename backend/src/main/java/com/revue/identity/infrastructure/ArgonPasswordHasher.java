package com.revue.identity.infrastructure;

import com.revue.identity.application.PasswordHasher;
import com.revue.identity.domain.PasswordHash;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Component;

/** Encodes passwords with Argon2id and handles missing accounts with a dummy hash. */
@Component
public class ArgonPasswordHasher implements PasswordHasher {
    private static final String PREFIX = "{argon2id}";
    private final Argon2PasswordEncoder encoder = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
    private final String dummy = encoder.encode(UUID.randomUUID().toString());

    @Override
    public PasswordHash encode(String password) {
        return new PasswordHash(PREFIX + encoder.encode(password));
    }

    @Override
    public boolean matches(String password, @Nullable PasswordHash hash) {
        if (hash != null && !hash.value().startsWith(PREFIX)) {
            encoder.matches(password, dummy);
            return false;
        }
        return encoder.matches(password, hash == null ? dummy : hash.value().substring(PREFIX.length()))
            && hash != null;
    }
}
