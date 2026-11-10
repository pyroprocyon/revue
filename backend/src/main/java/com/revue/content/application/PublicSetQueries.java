package com.revue.content.application;

import java.util.List;
import java.util.Optional;

/** Read port: projections avoid loading entire publication aggregates for public browsing. */
public interface PublicSetQueries {
    /** Public set metadata with its active card count. */
    record Overview(String setKey, String title, String description, String publisherName, long cardCount) {}

    /** Lists the available sets and their active card counts. */
    List<Overview> list();

    /** Finds an available set by its stable key. */
    Optional<Overview> summary(String setKey);

    /** Loads at most the requested number of active trial cards. */
    Optional<DemoCards> demoCards(String setKey, int limit);
}
