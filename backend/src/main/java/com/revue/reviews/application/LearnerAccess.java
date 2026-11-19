package com.revue.reviews.application;

import java.util.UUID;

/** Supplies the eligible session learner and serializes changes to their study data. */
public interface LearnerAccess {
    /** Returns the authenticated learner, never an identity supplied by the browser. */
    UUID current();

    /** Revalidates eligibility under a lock held through the calling transaction. */
    UUID lockCurrent();
}
