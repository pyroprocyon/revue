package com.revue.identity.infrastructure;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AccountService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/** Current account facts, rather than a cached session authority, decide private access. */
final class CurrentAccountFilter extends OncePerRequestFilter {
    private final AccountService accounts;
    private final RequestMatcher publicRoutes;

    CurrentAccountFilter(AccountService accounts, RequestMatcher publicRoutes) {
        this.accounts = accounts;
        this.publicRoutes = publicRoutes;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        boolean managedRoute = AccountRoutes.API.matches(request) || AccountRoutes.OPERATIONS.matches(request);
        return !managedRoute || publicRoutes.matches(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        try {
            request.setAttribute(AccountService.Profile.class.getName(), accounts.current());
        } catch (AccountProblem _) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        chain.doFilter(request, response);
    }
}
