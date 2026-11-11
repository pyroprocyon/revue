package com.revue.content.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Publication persistence. Each loaded handle contains at most one set and its card history. */
public interface PublishedSetRepository {
    /** Loads one aggregate, keeping retained history bounded. */
    LoadedSet loadSet(String key);

    /** Finds existing owners for the incoming card keys only. */
    Map<String, String> ownersOf(List<String> cardKeys);

    /** Retires missing active sets without loading their cards. */
    int retireMissing(Set<String> incomingKeys, Instant now);

    /** A single aggregate and its persistence mapping, valid until saved. */
    interface LoadedSet {
        /** Returns existing content, including retired cards. */
        Optional<PublishedSet> existing();

        /** Saves and releases the aggregate's persistence context. */
        void save(PublishedSet set);
    }
}
