package com.revue.identity.application;

/** Shared abuse budget across replicas. Implementations release database resources before hashing starts. */
public interface AuthenticationAttemptStore {
    /** Spends one attempt or rejects immediately when the budget or store capacity is exhausted. */
    boolean tryAcquire(String identifierHash);
}
