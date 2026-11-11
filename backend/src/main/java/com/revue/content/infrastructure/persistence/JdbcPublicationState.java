package com.revue.content.infrastructure.persistence;

import com.revue.content.application.PublicationState;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPublicationState implements PublicationState {
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
    public void record(long revision, String digest) {
        jdbc.update(
            "UPDATE catalog_publication SET revision = ?, digest = ?, published_at = clock_timestamp() WHERE"
                + " singleton",
            revision,
            digest);
    }
}
