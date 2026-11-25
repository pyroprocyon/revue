package com.revue.content.application;

import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/** Read port: projections avoid loading entire publication aggregates for public browsing. */
public interface PublicSetQueries {
    /** Public set metadata with its active card count and the first question on detailed previews. */
    record Overview(
        long id,
        String setKey,
        String title,
        String description,
        String publisherName,
        String subject,
        long cardCount,
        boolean saveAllowed,
        @Nullable String sampleQuestion) {
    }

    /** A subject and its count of active reviewers eligible to save. */
    record Subject(String subject, long topicCount) {
    }

    /** Lists at most limit sets after the alphabetical cursor, with active card counts. */
    List<Overview> list(
        String afterTitle,
        long afterId,
        int limit,
        boolean saveableOnly,
        @Nullable String subject,
        String search);

    List<Subject> subjects();

    List<Overview> onboarding(List<String> keys);

    /** Finds an available set by its stable key. */
    Optional<Overview> summary(String setKey);

    /** Finds an available set by its permanent public identifier. */
    Optional<Overview> summaryById(long id);

    /** Loads at most the requested number of active trial cards. */
    Optional<TrialCards> trialCards(String setKey, int limit);
}
