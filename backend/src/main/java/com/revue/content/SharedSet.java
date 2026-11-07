package com.revue.content;

import java.time.Instant;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.jspecify.annotations.Nullable;

/**
 * A shared set loaded from a YAML file (table {@code sets}). It is retired, never deleted, so
 * students who saved it keep their history.
 */
@Entity
@Table(name = "sets")
class SharedSet {

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

	protected SharedSet() {
		this.setKey = "";
		this.title = "";
		this.description = "";
		this.publisherName = "";
		this.subject = "";
	}

	SharedSet(String setKey) {
		this();
		this.setKey = setKey;
	}

	/** Copies the file's set details; only real changes mark the row as updated. */
	void applyFrom(SetFile file) {
		if (!Objects.equals(title, file.title())) {
			title = file.title();
		}
		if (!Objects.equals(description, file.description())) {
			description = file.description();
		}
		if (!Objects.equals(publisherName, file.publisher())) {
			publisherName = file.publisher();
		}
		if (!Objects.equals(subject, file.subject())) {
			subject = file.subject();
		}
	}

	/** Returns true if the set was active and is now retired. */
	boolean retire(Instant now) {
		if (retiredAt != null) {
			return false;
		}
		retiredAt = now;
		return true;
	}

	/** Returns true if the set was retired and is now active again. */
	boolean restore() {
		if (retiredAt == null) {
			return false;
		}
		retiredAt = null;
		return true;
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

	String subject() {
		return subject;
	}

	String description() {
		return description;
	}

	@Nullable Instant retiredAt() {
		return retiredAt;
	}

	@Nullable Instant updatedAt() {
		return updatedAt;
	}

}
