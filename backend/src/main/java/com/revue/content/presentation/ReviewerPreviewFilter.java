package com.revue.content.presentation;

import com.revue.content.application.PublicSetService;
import com.revue.content.application.PublicSetSummary;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnResource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.HtmlUtils;

/** Supplies messaging crawlers with the published reviewer's metadata in the initial HTML response. */
@Component
@ConditionalOnResource(resources = "classpath:/templates/reviewer.html")
@Order(Ordered.LOWEST_PRECEDENCE - 2)
class ReviewerPreviewFilter extends OncePerRequestFilter {
    private static final Pattern REVIEWER_PATH = Pattern.compile("/(s|sets)/([a-z0-9]++(?:-[a-z0-9]++)*+)/?");
    private final PublicSetService publicSets;
    private final String beforePreview;
    private final String afterPreview;

    ReviewerPreviewFilter(PublicSetService publicSets) throws IOException {
        this.publicSets = publicSets;
        var index = new ClassPathResource("templates/reviewer.html").getContentAsString(StandardCharsets.UTF_8);
        String[] parts = index.split("<!-- reviewer-preview -->", -1);
        if (parts.length != 3) {
            throw new IllegalStateException("Expected two reviewer preview markers in the frontend build");
        }
        beforePreview = parts[0];
        afterPreview = parts[2];
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !HttpMethod.GET.matches(request.getMethod()) && !HttpMethod.HEAD.matches(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        var match = REVIEWER_PATH.matcher(path);
        if (!match.matches()) {
            chain.doFilter(request, response);
            return;
        }
        boolean shortLink = "s".equals(match.group(1));
        var reviewer = findReviewer(shortLink, match.group(2));
        if (reviewer.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        if (shortLink || path.endsWith("/")) {
            response.setHeader("X-Robots-Tag", "noindex");
        }
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType("text/html;charset=UTF-8");
        if (HttpMethod.GET.matches(request.getMethod())) {
            var set = reviewer.orElseThrow();
            var writer = response.getWriter();
            writer.write(beforePreview);
            writer.write(
                """
                    <meta property="og:title" content="%s" />
                    <meta property="og:description" content="%s" />
                    """.formatted(
                    HtmlUtils.htmlEscape(set.title(), "UTF-8"),
                    HtmlUtils.htmlEscape(set.description(), "UTF-8")));
            writer.write(afterPreview);
        }
    }

    private Optional<PublicSetSummary> findReviewer(boolean shortLink, String identifier) {
        try {
            return shortLink ? publicSets.summaryByShareCode(identifier) : publicSets.summary(identifier);
        } catch (CannotCreateTransactionException | DataAccessResourceFailureException _) {
            // The static app can still open and retry its catalog request after the database wakes up.
            return Optional.empty();
        }
    }
}
