package com.revue.identity.application;

import java.time.LocalDate;
import java.util.UUID;

/** Identity-owned study dates; the caller holds the learner lock in the same transaction. */
public interface AccountStudyDates {
    /** Records the first study day and first later day without replacing prior observations. */
    void recordStudyDay(UUID learner, LocalDate day);
}
