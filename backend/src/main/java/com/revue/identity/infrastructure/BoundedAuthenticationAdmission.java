package com.revue.identity.infrastructure;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AuthenticationAdmission;
import com.revue.identity.application.AuthenticationAttemptStore;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.CannotCreateTransactionException;

/** One expensive authentication operation per replica; the attempt budget is shared in PostgreSQL. */
@Component
public class BoundedAuthenticationAdmission implements AuthenticationAdmission {
    private final Semaphore operations = new Semaphore(1);
    private final AuthenticationAttemptStore attempts;
    private final MeterRegistry metrics;

    public BoundedAuthenticationAdmission(AuthenticationAttemptStore attempts, MeterRegistry metrics) {
        this.attempts = attempts;
        this.metrics = metrics;
    }

    @Override
    public AutoCloseablePermit enter(String key) {
        if (!operations.tryAcquire()) {
            throw rejected("local_capacity", AccountProblem.Kind.AUTHENTICATION_BUSY);
        }
        try {
            return switch (attempts.tryAcquire(digest(key))) {
                case ADMITTED -> acceptedPermit();
                case CONTENDED -> throw rejected("store_contention", AccountProblem.Kind.AUTHENTICATION_BUSY);
                case EXHAUSTED -> throw rejected("shared_budget", AccountProblem.Kind.OVERLOADED);
            };
        } catch (DataAccessException | CannotCreateTransactionException _) {
            operations.release();
            throw rejected("store_unavailable", AccountProblem.Kind.OVERLOADED);
        } catch (RuntimeException ex) {
            operations.release();
            throw ex;
        }
    }

    private AutoCloseablePermit acceptedPermit() {
        metrics.counter("revue.authentication.admission", "result", "accepted").increment();
        var released = new AtomicBoolean();
        return () -> {
            if (released.compareAndSet(false, true)) {
                operations.release();
            }
        };
    }

    private AccountProblem rejected(String reason, AccountProblem.Kind kind) {
        metrics.counter("revue.authentication.admission", "result", reason).increment();
        return new AccountProblem(kind, "Please wait a moment and try again");
    }

    private static String digest(String key) {
        try {
            return HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
