package com.revue.content.domain;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/** A card inside a published set. Its stable key survives corrections and retirement. */
public final class PublishedCard {
    private CardDefinition text;
    private int position;
    private int contentVersion;
    private @Nullable Instant retiredAt;

    private PublishedCard(CardDefinition text, int position, int version, @Nullable Instant retiredAt) {
        this.text = text;
        this.position = position;
        this.contentVersion = version;
        this.retiredAt = retiredAt;
    }

    static PublishedCard publish(CardDefinition text, int position) {
        return new PublishedCard(text, position, 1, null);
    }

    /** Reconstitutes stored state without treating it as a new publication. */
    public static PublishedCard restore(CardDefinition text, int position, int version, @Nullable Instant retiredAt) {
        return new PublishedCard(text, position, version, retiredAt);
    }

    boolean correct(CardDefinition replacement) {
        if (!text.key().equals(replacement.key())) {
            throw new IllegalArgumentException("A correction cannot change a card's key");
        }
        if (text.equals(replacement)) {
            return false;
        }
        text = replacement;
        contentVersion++;
        return true;
    }

    void moveTo(int position) {
        this.position = position;
    }

    boolean retire(Instant now) {
        if (retiredAt != null) {
            return false;
        }
        retiredAt = now;
        return true;
    }

    boolean reactivate() {
        if (retiredAt == null) {
            return false;
        }
        retiredAt = null;
        return true;
    }

    /** Returns the card's stable publication key. */
    public String key() {
        return text.key();
    }

    /** Returns the current immutable card definition. */
    public CardDefinition text() {
        return text;
    }

    /** Returns the card's position within its published set. */
    public int position() {
        return position;
    }

    /** Returns the content revision used to distinguish corrections. */
    public int contentVersion() {
        return contentVersion;
    }

    /** Returns the retirement time, or null while the card is available. */
    public @Nullable Instant retiredAt() {
        return retiredAt;
    }
}
