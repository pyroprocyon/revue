package com.revue.content.infrastructure.persistence;

import com.revue.content.domain.PublishedCard;
import com.revue.content.domain.PublishedSet;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.jspecify.annotations.Nullable;

/**
 * A shared set loaded from a YAML file (table {@code sets}). It is retired, never deleted, so students who saved it
 * keep their history.
 */
@Entity(name = "SharedSet")
@Table(name = "sets")
class SharedSetRow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private @Nullable Long id;

    @Column(name = "set_key", nullable = false, updatable = false)
    private String setKey;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @Column(name = "publisher_name", nullable = false)
    private String publisherName;

    @Column(nullable = false)
    private String subject;

    @Column(name = "retired_at")
    private @Nullable Instant retiredAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private @Nullable Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private @Nullable Instant updatedAt;

    protected SharedSetRow() {
        this.setKey = "";
        this.title = "";
        this.description = "";
        this.publisherName = "";
        this.subject = "";
    }

    SharedSetRow(String setKey) {
        this();
        this.setKey = setKey;
    }

    void updateFrom(PublishedSet set) {
        title = set.title();
        description = set.description();
        publisherName = set.publisherName();
        subject = set.subject();
        retiredAt = set.retiredAt();
    }

    PublishedSet toDomain(List<PublishedCard> cards) {
        return PublishedSet.restore(setKey, title, description, publisherName, subject, retiredAt, cards);
    }

    @Nullable Long id() {
        return id;
    }

    String setKey() {
        return setKey;
    }

    String title() {
        return title;
    }

    String publisherName() {
        return publisherName;
    }

    String description() {
        return description;
    }
}
