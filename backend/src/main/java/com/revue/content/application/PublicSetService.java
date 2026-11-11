package com.revue.content.application;

import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Serves published set summaries and complete five-card trials to guests. */
@Service
@Transactional(readOnly = true)
public class PublicSetService {
    private static final int TRIAL_CARD_COUNT = 5;
    private final PublicSetQueries queries;

    /** Creates the public catalog service with its query port. */
    public PublicSetService(PublicSetQueries queries) {
        this.queries = queries;
    }

    /** Lists the currently available published sets. */
    public CatalogPage list(@Nullable String after, int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("Page size must be between 1 and 100");
        }
        var cursor = CatalogCursor.parse(after);
        var rows = queries.list(cursor.title(), cursor.id(), limit + 1);
        var visible = rows.stream().limit(limit).toList();
        String next = null;
        if (rows.size() > limit) {
            var last = visible.getLast();
            next = new CatalogCursor(last.title(), last.id()).encode();
        }
        return new CatalogPage(visible.stream().map(PublicSetService::summaryOf).toList(), next);
    }

    /** Finds a public summary for an available set key. */
    public Optional<PublicSetSummary> summary(String setKey) {
        return queries.summary(setKey).map(PublicSetService::summaryOf);
    }

    /** Resolves a canonical short code to an active public set. */
    public Optional<PublicSetSummary> summaryByShareCode(String code) {
        if (!code.matches("[0-9a-z]{1,13}")) {
            return Optional.empty();
        }
        try {
            long id = Long.parseLong(code, 36);
            if (id <= 0 || !Long.toString(id, 36).equals(code)) {
                return Optional.empty();
            }
            return queries.summaryById(id).map(PublicSetService::summaryOf);
        } catch (NumberFormatException _) {
            return Optional.empty();
        }
    }

    /** Returns a trial only when the set has the full required number of cards. */
    public Optional<TrialCards> trialCards(String setKey) {
        return queries.trialCards(setKey, TRIAL_CARD_COUNT).filter(result -> result.cards().size() == TRIAL_CARD_COUNT);
    }

    private static PublicSetSummary summaryOf(PublicSetQueries.Overview set) {
        return new PublicSetSummary(
            set.setKey(),
            set.title(),
            set.description(),
            set.publisherName(),
            set.cardCount(),
            set.cardCount() >= TRIAL_CARD_COUNT,
            Long.toString(set.id(), 36));
    }
}
