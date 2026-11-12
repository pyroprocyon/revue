package com.revue.content.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.content.application.PublicationState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPublicationState implements PublicationState {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcPublicationState.class);

    private final JdbcTemplate jdbc;

    JdbcPublicationState(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Current lock() {
        jdbc.execute("SET LOCAL lock_timeout = '5s'");
        return jdbc.queryForObject(
            "SELECT revision, digest FROM catalog_publication WHERE singleton FOR UPDATE",
            (row, index) -> new Current(row.getLong(1), row.getString(2)));
    }

    @Override
    public void recordSuccess(long previousRevision, long revision, String digest) {
        jdbc.update(
            "UPDATE catalog_publication SET revision = ?, digest = ?, published_at = clock_timestamp() WHERE"
                + " singleton",
            revision,
            digest);
        AfterCommit.log(
            () -> LOG.atInfo()
                .addKeyValue("event.name", "catalog.published")
                .addKeyValue("event.outcome", "success")
                .addKeyValue("entity.type", "catalog")
                .addKeyValue("state.from", previousRevision)
                .addKeyValue("state.to", revision)
                .addKeyValue("catalog.revision", revision)
                .log("Catalog publication committed"));
    }
}
