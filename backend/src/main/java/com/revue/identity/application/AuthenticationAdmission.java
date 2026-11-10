package com.revue.identity.application;

/** Bounds concurrent and per-identity authentication work before password hashing. */
public interface AuthenticationAdmission {
    /** Acquires permission for an authentication attempt or rejects overload. */
    AutoCloseablePermit enter(String key);

    /** Releases an admitted authentication operation when closed. */
    interface AutoCloseablePermit extends AutoCloseable {
        @Override
        void close();
    }
}
