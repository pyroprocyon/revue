package com.revue.content;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * A shared card (table {@code cards}). Each one exists once, owned by its set, so a correction
 * reaches every student who saved the set. It is retired, never deleted.
 */
@Entity
@Table(name = "cards")
class Card {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private @Nullable Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "set_id", nullable = false, updatable = false)
	private SharedSet sharedSet;

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

	protected Card() {
		this.contentKey = "";
		this.question = "";
		this.answer = "";
		this.keyIdeas = new ArrayList<>();
		this.contentVersion = 1;
	}

	Card(SharedSet set, String contentKey) {
		this();
		this.sharedSet = set;
		this.contentKey = contentKey;
	}

	/**
	 * Copies the card's text from its file. A change to an existing card's question, answer,
	 * explanation, memory hook, source or key ideas raises its content version, so review logs can
	 * tell which text a student saw. Returns true if the text changed.
	 */
	boolean applyFrom(CardFile file) {
		boolean changed = !Objects.equals(question, file.question()) || !Objects.equals(answer, file.answer())
				|| !Objects.equals(explanation, file.explanation()) || !Objects.equals(memoryHook, file.memoryHook())
				|| !Objects.equals(source, file.source()) || !keyIdeas.equals(file.keyIdeas());
		if (!changed) {
			return false;
		}
		question = file.question();
		answer = file.answer();
		explanation = file.explanation();
		memoryHook = file.memoryHook();
		source = file.source();
		keyIdeas = new ArrayList<>(file.keyIdeas());
		if (id != null) {
			contentVersion++;
		}
		return true;
	}

	/** Positions follow the file's order and are rewritten on every load. */
	void moveTo(int newPosition) {
		if (position != newPosition) {
			position = newPosition;
		}
	}

	/** Returns true if the card was active and is now retired. */
	boolean retire(Instant now) {
		if (retiredAt != null) {
			return false;
		}
		retiredAt = now;
		return true;
	}

	/** Returns true if the card was retired and is now active again. */
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

	SharedSet sharedSet() {
		return sharedSet;
	}

	String contentKey() {
		return contentKey;
	}

	int position() {
		return position;
	}

	String question() {
		return question;
	}

	String answer() {
		return answer;
	}

	@Nullable String explanation() {
		return explanation;
	}

	@Nullable String memoryHook() {
		return memoryHook;
	}

	@Nullable String source() {
		return source;
	}

	List<String> keyIdeas() {
		return List.copyOf(keyIdeas);
	}

	int contentVersion() {
		return contentVersion;
	}

	@Nullable Instant retiredAt() {
		return retiredAt;
	}

	@Nullable Instant updatedAt() {
		return updatedAt;
	}

}
