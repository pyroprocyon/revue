package com.revue.content.application;

import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Serves published set summaries and complete five-card trials to guests. */
@Service
@Transactional(readOnly = true)
public class PublicSetService {
    private static final int TRIAL_CARD_COUNT = 5;
    private static final List<String> ONBOARDING_KEYS = List
        .of("philippine-history", "philippine-nature", "weather-and-disasters");
    private final PublicSetQueries queries;

    public PublicSetService(PublicSetQueries queries) {
        this.queries = queries;
    }

    public CatalogPage list(
        @Nullable String after,
        int limit,
        boolean publishedOnly,
        @Nullable String subject,
        String search) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("Page size must be between 1 and 100");
        }
        var cursor = CatalogCursor.parse(after);
        if (search.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Invalid catalog search");
        }
        var rows = queries.list(cursor.title(), cursor.id(), limit + 1, publishedOnly, subject, search);
        var visible = rows.stream().limit(limit).toList();
        String next = null;
        if (rows.size() > limit) {
            var last = visible.getLast();
            next = new CatalogCursor(last.title(), last.id()).encode();
        }
        return new CatalogPage(visible.stream().map(PublicSetService::summaryOf).toList(), next);
    }

    public List<PublicSetQueries.Subject> subjects() {
        return queries.subjects();
    }

    public List<PublicSetSummary> onboarding() {
        return queries.onboarding(ONBOARDING_KEYS).stream().map(PublicSetService::summaryOf).toList();
    }

    public Optional<PublicSetSummary.Preview> summary(String setKey) {
        return queries.summary(setKey).map(PublicSetService::previewOf);
    }

    /** Resolves a canonical short code to an active public set. */
    public Optional<PublicSetSummary.Preview> summaryByShareCode(String code) {
        if (!code.matches("[0-9a-z]{1,13}")) {
            return Optional.empty();
        }
        try {
            long id = Long.parseLong(code, 36);
            if (id <= 0 || !Long.toString(id, 36).equals(code)) {
                return Optional.empty();
            }
            return queries.summaryById(id).map(PublicSetService::previewOf);
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
            set.subject(),
            set.cardCount(),
            set.cardCount() >= TRIAL_CARD_COUNT,
            Long.toString(set.id(), 36),
            set.saveAllowed());
    }

    private static PublicSetSummary.Preview previewOf(PublicSetQueries.Overview set) {
        var summary = summaryOf(set);
        return new PublicSetSummary.Preview(summary, summary.trialAvailable() ? set.sampleQuestion() : null);
    }
}
