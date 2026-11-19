package com.revue.identity.presentation;

import com.revue.identity.application.AccountService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Exposes the pilot account and CSRF endpoints through the application service. */
@RestController
public class AccountController {
    private final AccountService accounts;

    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    /** Returns a CSRF token for the browser's next request and the learner it was issued for. */
    @GetMapping("/api/v1/auth/csrf")
    public AccountService.FormToken csrf() {
        return accounts.csrf();
    }

    /** Creates a username account using a valid invitation. */
    @PostMapping(path = "/api/v1/auth/register", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public AccountService.Profile register(
        @RequestParam String username,
        @RequestParam String password,
        @RequestParam String invitation) {
        return accounts.register(username, password, invitation);
    }

    /** Authenticates a username and establishes the browser session. */
    @PostMapping(path = "/api/v1/auth/login", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public AccountService.Profile signIn(@RequestParam String username, @RequestParam String password) {
        return accounts.signIn(username, password);
    }

    /** Reports session status for public navigation without exposing profile details. */
    @GetMapping("/api/v1/auth/session")
    public SessionStatus session() {
        return new SessionStatus(accounts.signedIn());
    }

    /** Public navigation needs only the presence of an eligible session. */
    public record SessionStatus(boolean signedIn) {
    }

    /** Returns the current eligible account's public profile. */
    @GetMapping("/api/v1/me")
    public AccountService.Profile current(
        @RequestAttribute(AccountService.EligibleAccount.REQUEST_ATTRIBUTE) AccountService.EligibleAccount account) {
        return account.profile();
    }
}
