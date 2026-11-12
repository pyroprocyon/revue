package com.revue;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Runs operational logging after the enclosing Spring transaction has committed. */
public final class AfterCommit {
    private AfterCommit() {
    }

    /** Discards the log action when the enclosing transaction rolls back. */
    public static void log(Runnable writeEvent) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    writeEvent.run();
                }
            }
        });
    }
}
