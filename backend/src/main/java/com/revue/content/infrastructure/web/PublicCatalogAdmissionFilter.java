package com.revue.content.infrastructure.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.Semaphore;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps public reads before JDBC session lookup. Three permits leave room in the five-connection pool for learner work.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 40)
class PublicCatalogAdmissionFilter extends OncePerRequestFilter {
    private final Semaphore permits = new Semaphore(3);
    private final PathPatternRequestMatcher catalog = PathPatternRequestMatcher.withDefaults()
        .matcher("/api/v1/public-sets/**");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        return !("GET".equals(method) || "HEAD".equals(method)) || !catalog.matches(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (!permits.tryAcquire()) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setHeader(HttpHeaders.RETRY_AFTER, "1");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            return;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            permits.release();
        }
    }
}
