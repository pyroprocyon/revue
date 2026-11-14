package com.revue.reviews.application;

import java.time.LocalDate;
import java.util.UUID;

/** Joins the identity-owned study-date write to a successful review transaction. */
public interface StudyDates {
    /** Records study without exposing the account model to reviews. */
    void recordStudyDay(UUID learner, LocalDate day);
}
