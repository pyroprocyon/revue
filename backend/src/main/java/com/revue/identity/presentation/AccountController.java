package com.revue.identity.presentation;

import com.revue.identity.application.AccountService;
import com.revue.identity.application.AccountSession;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Objects;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Exposes the pilot account and CSRF endpoints through the application service. */
@RestController
public class AccountController {
    private final AccountService accounts;

    /** Creates the account endpoint adapter with its application service. */
    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    /** Returns a CSRF token for the browser's next account request. */
    @GetMapping("/api/v1/auth/csrf")
    public AccountSession.Csrf csrf() {
        return accounts.csrf();
    }

    /** Creates an invited account after both pilot confirmations are accepted. */
    @PostMapping(path = "/api/v1/auth/register", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public AccountService.Profile register(
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam String invitation,
            @RequestParam boolean privacy,
            @RequestParam boolean adult) {
        return accounts.register(username, password, invitation, privacy, adult);
    }

    /** Authenticates a username and establishes the browser session. */
    @PostMapping(path = "/api/v1/auth/login", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public AccountService.Profile signIn(@RequestParam String username, @RequestParam String password) {
        return accounts.signIn(username, password);
    }

    /** Returns the current eligible account's public profile. */
    @GetMapping("/api/v1/me")
    public AccountService.Profile current(HttpServletRequest request) {
        // The security filter validated this profile for this request before controller dispatch.
        return (AccountService.Profile)
                Objects.requireNonNull(request.getAttribute(AccountService.Profile.class.getName()));
    }
}
