package com.revue.content.application;

import java.util.List;
import java.util.Optional;

/** Read port: projections avoid loading entire publication aggregates for public browsing. */
public interface PublicSetQueries {
    /** Public set metadata with its active card count. */
    record Overview(long id, String setKey, String title, String description, String publisherName, long cardCount) {
    }

    /** Lists at most limit sets after the alphabetical cursor, with active card counts. */
    List<Overview> list(String afterTitle, long afterId, int limit);

    /** Finds an available set by its stable key. */
    Optional<Overview> summary(String setKey);

    /** Finds an available set by its permanent public identifier. */
    Optional<Overview> summaryById(long id);

    /** Loads at most the requested number of active trial cards. */
    Optional<TrialCards> trialCards(String setKey, int limit);
}
