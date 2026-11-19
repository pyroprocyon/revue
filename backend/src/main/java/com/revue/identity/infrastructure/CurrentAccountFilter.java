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

/**
 * Current account facts, rather than a cached session authority, decide private access. A request that names its
 * learner in {@value #LEARNER_HEADER} is refused unless that learner is the one signed in, so a write from a page
 * opened for one learner never lands in an account that signed in since.
 */
final class CurrentAccountFilter extends OncePerRequestFilter {
    static final String LEARNER_HEADER = "X-Revue-Learner";

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
        AccountService.EligibleAccount account;
        try {
            account = accounts.eligibleAccount();
        } catch (AccountProblem _) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String learner = request.getHeader(LEARNER_HEADER);
        if (learner != null && !learner.equals(account.profile().username())) {
            request.setAttribute(AccountOperationLogFilter.DENIAL_REASON, "learner_mismatch");
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            return;
        }
        request.setAttribute(AccountService.EligibleAccount.REQUEST_ATTRIBUTE, account);
        chain.doFilter(request, response);
    }
}
