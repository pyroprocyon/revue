package com.revue.reviews.application;

import java.util.UUID;

/** Confirms the session and locks the eligible learner until the calling transaction ends. */
public interface LearnerAccess {
    /** Returns the authenticated learner, never an identity supplied by the browser. */
    UUID lockCurrent();
}
