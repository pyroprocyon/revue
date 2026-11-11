package com.revue.content.infrastructure.persistence;

import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.PublishedCard;
import com.revue.content.domain.PublishedSet;
import com.revue.content.domain.PublishedSetRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.domain.Limit;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Saves one set at a time. Flushing releases JPA memory without committing the publication transaction. */
@Repository
class JpaPublishedSetRepository implements PublishedSetRepository {
    private static final int MAX_RETAINED_CARDS_PER_SET = 20_000;
    private final JpaSharedSetRepository sets;
    private final JpaCardRepository cards;
    private final EntityManager entities;
    private final NamedParameterJdbcTemplate jdbc;

    JpaPublishedSetRepository(
        JpaSharedSetRepository sets,
        JpaCardRepository cards,
        EntityManager entities,
        NamedParameterJdbcTemplate jdbc) {
        this.sets = sets;
        this.cards = cards;
        this.entities = entities;
        this.jdbc = jdbc;
    }

    @Override
    public LoadedSet loadSet(String key) {
        var row = sets.findBySetKey(key);
        var rows = row.map(set -> cards.findInSetOrdered(set, Limit.of(MAX_RETAINED_CARDS_PER_SET + 1)))
            .orElse(List.of());
        if (rows.size() > MAX_RETAINED_CARDS_PER_SET) {
            throw new InvalidContentException(List.of(key + ": retained card history exceeds publication limit"));
        }
        return new Loaded(row, rows);
    }

    @Override
    public Map<String, String> ownersOf(List<String> cardKeys) {
        Map<String, String> owners = new HashMap<>();
        if (!cardKeys.isEmpty()) {
            jdbc.query(
                "SELECT c.content_key, s.set_key FROM cards c JOIN sets s ON s.id = c.set_id WHERE c.content_key IN"
                    + " (:keys)",
                Map.of("keys", cardKeys),
                row -> {
                    owners.put(row.getString(1), row.getString(2));
                });
        }
        return owners;
    }

    @Override
    public int retireMissing(Set<String> incomingKeys, Instant now) {
        return jdbc.update(
            "UPDATE sets SET retired_at = :now, updated_at = :now WHERE retired_at IS NULL AND set_key NOT IN"
                + " (:keys)",
            new MapSqlParameterSource("keys", incomingKeys).addValue("now", java.sql.Timestamp.from(now)));
    }

    private final class Loaded implements LoadedSet {
        private final Optional<SharedSetRow> row;
        private final Map<String, CardRow> cardRows = new HashMap<>();
        private final Optional<PublishedSet> existing;

        Loaded(Optional<SharedSetRow> row, List<CardRow> rows) {
            this.row = row;
            rows.forEach(card -> cardRows.put(card.contentKey(), card));
            existing = row.map(set -> set.toDomain(rows.stream().map(CardRow::toDomain).toList()));
        }

        @Override
        public Optional<PublishedSet> existing() {
            return existing;
        }

        @Override
        public void save(PublishedSet publication) {
            if (publication.cards().size() > MAX_RETAINED_CARDS_PER_SET) {
                throw new InvalidContentException(
                    List.of(publication.key() + ": retained card history exceeds publication limit"));
            }
            SharedSetRow saved = row.orElseGet(() -> sets.save(new SharedSetRow(publication.key())));
            saved.updateFrom(publication);
            for (PublishedCard card : publication.cards()) {
                CardRow mapped = cardRows.get(card.key());
                if (mapped == null) {
                    mapped = new CardRow(saved, card.key());
                    mapped.updateFrom(card);
                    cards.save(mapped);
                } else {
                    mapped.updateFrom(card);
                }
            }
            entities.flush();
            entities.clear();
        }
    }
}
