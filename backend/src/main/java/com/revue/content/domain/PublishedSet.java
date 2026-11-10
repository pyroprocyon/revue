package com.revue.content.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Aggregate root: only the set changes its cards, their positions and publication state. */
public final class PublishedSet {
    private final String key;
    private String title;
    private String description;
    private String publisherName;
    private String subject;
    private @Nullable Instant retiredAt;
    private final Map<String, PublishedCard> cards = new LinkedHashMap<>();

    private PublishedSet(
            String key,
            String title,
            String description,
            String publisherName,
            String subject,
            @Nullable Instant retiredAt,
            List<PublishedCard> cards) {
        this.key = key;
        this.title = title;
        this.description = description;
        this.publisherName = publisherName;
        this.subject = subject;
        this.retiredAt = retiredAt;
        for (PublishedCard card : cards) {
            this.cards.put(card.key(), card);
        }
    }

    /** Creates the initial published set and its cards from a valid definition. */
    public static PublishedSet publish(SetDefinition definition) {
        validate(definition);
        List<PublishedCard> cards = new ArrayList<>();
        for (int position = 0; position < definition.cards().size(); position++) {
            cards.add(PublishedCard.publish(definition.cards().get(position), position));
        }
        return new PublishedSet(
                definition.setKey(),
                definition.title(),
                definition.description(),
                definition.publisher(),
                definition.subject(),
                null,
                cards);
    }

    /** Reconstitutes the aggregate without publishing or changing versions. */
    public static PublishedSet restore(
            String key,
            String title,
            String description,
            String publisherName,
            String subject,
            @Nullable Instant retiredAt,
            List<PublishedCard> cards) {
        return new PublishedSet(key, title, description, publisherName, subject, retiredAt, cards);
    }

    /** Counts the changes made while reconciling one published set. */
    public record Changes(boolean restored, int cardsAdded, int cardsChanged, int cardsRetired, int cardsRestored) {}

    /** Applies a validated revision while preserving card identity and retirement history. */
    public Changes synchronize(SetDefinition definition, Instant now) {
        validate(definition);
        if (!key.equals(definition.setKey())) {
            throw new IllegalArgumentException("A publication cannot change a set's key");
        }
        final boolean restored = retiredAt != null;
        retiredAt = null;
        title = definition.title();
        description = definition.description();
        publisherName = definition.publisher();
        subject = definition.subject();
        int added = 0;
        int changed = 0;
        int retired = 0;
        int reactivated = 0;
        var incomingKeys = new HashSet<String>();
        for (int position = 0; position < definition.cards().size(); position++) {
            CardDefinition replacement = definition.cards().get(position);
            incomingKeys.add(replacement.key());
            PublishedCard card = cards.get(replacement.key());
            if (card == null) {
                cards.put(replacement.key(), PublishedCard.publish(replacement, position));
                added++;
                continue;
            }
            if (card.reactivate()) {
                reactivated++;
            }
            if (card.correct(replacement)) {
                changed++;
            }
            card.moveTo(position);
        }
        for (PublishedCard card : cards.values()) {
            if (!incomingKeys.contains(card.key()) && card.retire(now)) {
                retired++;
            }
        }
        return new Changes(restored, added, changed, retired, reactivated);
    }

    /** Retiring a set preserves its active cards for existing savers. */
    public boolean retire(Instant now) {
        if (retiredAt != null) {
            return false;
        }
        retiredAt = now;
        return true;
    }

    private static void validate(SetDefinition definition) {
        List<String> problems = new ArrayList<>();
        ContentRules.check(List.of(definition), problems);
        if (!problems.isEmpty()) {
            throw new InvalidContentException(problems);
        }
    }

    /** Returns the stable set key used by published links. */
    public String key() {
        return key;
    }

    /** Returns the current published title. */
    public String title() {
        return title;
    }

    /** Returns the current published description. */
    public String description() {
        return description;
    }

    /** Returns the attributed publisher's display name. */
    public String publisherName() {
        return publisherName;
    }

    /** Returns the published subject label. */
    public String subject() {
        return subject;
    }

    /** Returns the retirement time, or null while the set is available. */
    public @Nullable Instant retiredAt() {
        return retiredAt;
    }

    /** Returns an immutable snapshot of all cards, including retired cards. */
    public List<PublishedCard> cards() {
        return List.copyOf(cards.values());
    }
}
