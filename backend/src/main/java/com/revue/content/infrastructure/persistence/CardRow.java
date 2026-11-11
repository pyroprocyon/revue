package com.revue.content.infrastructure.persistence;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.PublishedCard;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * A shared card (table {@code cards}). Each one exists once, owned by its set, so a correction reaches every student
 * who saved the set. It is retired, never deleted.
 */
@Entity(name = "Card")
@Table(name = "cards")
class CardRow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private @Nullable Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "set_id", nullable = false, updatable = false)
    private SharedSetRow sharedSet;

    @Column(name = "content_key", nullable = false, updatable = false)
    private String contentKey;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private String question;

    @Column(nullable = false)
    private String answer;

    private @Nullable String explanation;

    @Column(name = "memory_hook")
    private @Nullable String memoryHook;

    private @Nullable String source;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "key_ideas", nullable = false)
    private List<String> keyIdeas;

    @Column(name = "content_version", nullable = false)
    private int contentVersion;

    @Column(name = "retired_at")
    private @Nullable Instant retiredAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private @Nullable Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private @Nullable Instant updatedAt;

    protected CardRow() {
        this.contentKey = "";
        this.question = "";
        this.answer = "";
        this.keyIdeas = new ArrayList<>();
        this.contentVersion = 1;
    }

    CardRow(SharedSetRow set, String contentKey) {
        this();
        this.sharedSet = set;
        this.contentKey = contentKey;
    }

    void updateFrom(PublishedCard card) {
        CardDefinition text = card.text();
        position = card.position();
        question = text.question();
        answer = text.answer();
        explanation = text.explanation();
        memoryHook = text.memoryHook();
        source = text.source();
        keyIdeas = new ArrayList<>(text.keyIdeas());
        contentVersion = card.contentVersion();
        retiredAt = card.retiredAt();
    }

    PublishedCard toDomain() {
        return PublishedCard.restore(
            new CardDefinition(contentKey, question, answer, keyIdeas, explanation, memoryHook, source),
            position,
            contentVersion,
            retiredAt);
    }

    SharedSetRow sharedSet() {
        return sharedSet;
    }

    String contentKey() {
        return contentKey;
    }

    String question() {
        return question;
    }

    String answer() {
        return answer;
    }

    @Nullable
    String explanation() {
        return explanation;
    }

    @Nullable
    String source() {
        return source;
    }
}
