package com.revue.content.application;

import com.revue.content.domain.SetDefinition;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Publishes one complete source; older replicas cannot overwrite a newer revision. */
@Service
public class CatalogPublisher {
    private final PublicationState state;
    private final ContentLoader loader;

    /** Creates the publisher with the shared revision store and content reconciler. */
    public CatalogPublisher(PublicationState state, ContentLoader loader) {
        this.state = state;
        this.loader = loader;
    }

    /** Returns false for an identical retry. A failed import leaves revision and content unchanged. */
    @Transactional(timeout = 120)
    public boolean publish(long revision, String digest, List<SetDefinition> source) {
        if (revision < 1 || !digest.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Publication requires a positive revision and SHA-256 digest");
        }
        var current = state.lock();
        if (revision < current.revision() || (revision == current.revision() && !digest.equals(current.digest()))) {
            throw new IllegalStateException(
                "Catalog revision is stale or reused for different content; increment publication-revision.txt");
        }
        if (revision == current.revision()) {
            return false;
        }
        loader.load(source);
        state.recordSuccess(current.revision(), revision, digest);
        return true;
    }
}
