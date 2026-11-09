package com.revue.identity.application;

/** No existing identity or credential details are returned to a duplicate registration. */
public class RegistrationUnavailableException extends RuntimeException {
	public RegistrationUnavailableException() {
		super("Registration cannot be completed; use the sign-in or recovery flow");
	}
}
