package com.revue.identity.infrastructure;

import com.revue.identity.application.AccountSession;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.Serializable;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Adapts account sessions to Spring Security, JDBC sessions and CSRF cookies. */
@Component
public class HttpAccountSession implements AccountSession {
    private final SecurityContextRepository repository;
    private final SessionAuthenticationStrategy strategy;
    private final CookieCsrfTokenRepository csrf;

    /** Creates the HTTP session adapter with the configured authentication and CSRF strategies. */
    public HttpAccountSession(
        SecurityContextRepository repository,
        SessionAuthenticationStrategy strategy,
        CookieCsrfTokenRepository csrf) {
        this.repository = repository;
        this.strategy = strategy;
        this.csrf = csrf;
    }

    @Override
    public void establish(Identity identity) {
        var attributes = attributes();
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
            new Principal(identity.accountId(), identity.credentialVersion()),
            null,
            List.of(new SimpleGrantedAuthority("LEARNER")));
        strategy.onAuthentication(authentication, attributes.getRequest(), response(attributes));
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        repository.saveContext(context, attributes.getRequest(), response(attributes));
    }

    @Override
    public Optional<Identity> current() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof Principal(var accountId, var version)) {
            return Optional.of(new Identity(accountId, version));
        }
        return Optional.empty();
    }

    @Override
    public void clear() {
        SecurityContextHolder.clearContext();
        var attributes = attributes();
        HttpServletRequest request = attributes.getRequest();
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        csrf.saveToken(null, request, response(attributes));
    }

    @Override
    public Csrf csrf() {
        var attributes = attributes();
        var token = csrf.loadDeferredToken(attributes.getRequest(), response(attributes)).get();
        return new Csrf(token.getToken(), token.getHeaderName());
    }

    private static ServletRequestAttributes attributes() {
        return (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
    }

    private static HttpServletResponse response(ServletRequestAttributes attributes) {
        return Objects.requireNonNull(attributes.getResponse());
    }

    private record Principal(UUID accountId, long version) implements Serializable {
    }
}
