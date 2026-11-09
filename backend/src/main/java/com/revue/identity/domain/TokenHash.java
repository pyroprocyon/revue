package com.revue.identity.domain;

import java.util.Objects;

/** SHA-256 digest of a high-entropy token. Raw tokens never enter the persistence contract. */
public record TokenHash(String value) {
	public TokenHash {
		Objects.requireNonNull(value, "Token hash is required");
		if (!value.matches("[0-9a-f]{64}")) {
			throw new IllegalArgumentException("Invalid token hash");
		}
	}
	@Override
	public String toString() {
		return "TokenHash[redacted]";
	}
}
