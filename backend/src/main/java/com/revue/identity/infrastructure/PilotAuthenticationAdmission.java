package com.revue.identity.infrastructure;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AuthenticationAdmission;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Component;

/** Single-instance pilot admission: no waiting hash queue or database-backed counters. */
@Component
public class PilotAuthenticationAdmission implements AuthenticationAdmission {
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final int MAX_ATTEMPTS = 10;
    private static final int MAX_IDENTIFIERS = 1024;
    private final Map<String, Attempts> attempts = new HashMap<>();
    private final Semaphore operations = new Semaphore(1);
    private final Clock clock;

    /** Creates the single-instance admission limiter using the supplied clock. */
    public PilotAuthenticationAdmission(Clock clock) {
        this.clock = clock;
    }

    @Override
    public synchronized AutoCloseablePermit enter(String key) {
        Instant now = clock.instant();
        attempts.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expires()));
        Attempts previous = attempts.get(key);
        if ((previous != null && previous.count() >= MAX_ATTEMPTS)
                || (previous == null && attempts.size() >= MAX_IDENTIFIERS)
                || !operations.tryAcquire()) {
            throw new AccountProblem(AccountProblem.Kind.OVERLOADED, "Please wait a moment and try again");
        }
        attempts.put(
                key,
                previous == null
                        ? new Attempts(1, now.plus(WINDOW))
                        : new Attempts(previous.count() + 1, previous.expires()));
        return operations::release;
    }

    private record Attempts(int count, Instant expires) {}
}
