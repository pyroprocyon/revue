package com.revue.content.domain;

import java.util.List;

/** Publication writes use whole aggregates; there is no operation to delete shared content. */
public interface PublishedSetRepository {
    /** Load and save the catalog within the same publication transaction. */
    Catalog loadCatalog();

    /** Publication operations available inside the repository's catalog lock. */
    interface Catalog {
        List<PublishedSet> existingSets();

        void saveAll(List<PublishedSet> sets);
    }
}
