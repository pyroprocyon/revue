package com.revue.content.application;

/** Stores the last successful source revision under a transaction-wide database lock. */
public interface PublicationState {
    /** Locks and reads the current publication. Call inside the publication transaction. */
    Current lock();

    /** Records a successful publication in the same transaction as its content. */
    void recordSuccess(long revision, String digest);

    /** The last committed source revision and its content fingerprint. */
    record Current(long revision, String digest) {
    }
}
