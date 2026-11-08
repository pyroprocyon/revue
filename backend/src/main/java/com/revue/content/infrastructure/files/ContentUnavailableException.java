package com.revue.content.infrastructure.files;

/**
 * The content source couldn't be read completely, for example because no set file was found.
 * Loading stops before anything changes, so a missing source never retires every set.
 */
class ContentUnavailableException extends RuntimeException {

	ContentUnavailableException(String message, Throwable cause) {
		super(message, cause);
	}

	ContentUnavailableException(String message) {
		super(message);
	}

}
