package com.revue.identity.application;

/** Shared abuse budget across replicas. Implementations release database resources before hashing starts. */
public interface AuthenticationAttemptStore {
    /** Spends one attempt or reports contention or exhausted capacity without waiting. */
    Decision tryAcquire(String identifierHash);

    /** Contention can clear before the shared attempt budget expires. */
    enum Decision {
        ADMITTED,
        CONTENDED,
        EXHAUSTED
    }
}
