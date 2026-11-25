package com.revue.content.presentation;

import com.revue.AcceptedEncodings;
import com.revue.content.application.PublicSetService;
import com.revue.content.application.PublicSetSummary;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;
import java.util.zip.GZIPOutputStream;
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
import tools.jackson.databind.json.JsonMapper;

/** Supplies messaging crawlers with the published reviewer's metadata in the initial HTML response. */
@Component
@ConditionalOnResource(resources = "classpath:/templates/reviewer.html")
@Order(Ordered.LOWEST_PRECEDENCE - 2)
class ReviewerPreviewFilter extends OncePerRequestFilter {
    private static final Pattern REVIEWER_PATH = Pattern.compile("/(s|sets)/([a-z0-9]++(?:-[a-z0-9]++)*+)/?");
    private final PublicSetService publicSets;
    private final Semaphore publicCatalogPermits;
    private final JsonMapper json;
    private final String beforePreview;
    private final String afterPreview;

    ReviewerPreviewFilter(PublicSetService publicSets, Semaphore publicCatalogPermits, JsonMapper json)
        throws IOException {
        this.publicSets = publicSets;
        this.publicCatalogPermits = publicCatalogPermits;
        this.json = json;
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
        response.addHeader(HttpHeaders.VARY, HttpHeaders.ACCEPT_ENCODING);
        var codings = AcceptedEncodings.from(request).preferred(List.of("gzip", "identity"));
        if (codings.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_NOT_ACCEPTABLE);
            return;
        }
        boolean gzip = codings.getFirst().equals("gzip");
        response.setContentType("text/html;charset=UTF-8");
        if (gzip) {
            response.setHeader(HttpHeaders.CONTENT_ENCODING, "gzip");
        }
        if (HttpMethod.HEAD.matches(request.getMethod())) {
            return;
        }
        byte[] html = render(reviewer.orElseThrow()).getBytes(StandardCharsets.UTF_8);
        if (gzip) {
            try (var output = new GZIPOutputStream(response.getOutputStream())) {
                output.write(html);
            }
        } else {
            response.getOutputStream().write(html);
        }
    }

    private String render(PublicSetSummary.Preview preview) {
        var set = preview.summary();
        String metadata = """
            <meta property="og:title" content="%s" />
            <meta property="og:description" content="%s" />
            <meta name="revue:reviewer" content="%s" />
            """.formatted(
            HtmlUtils.htmlEscape(set.title(), StandardCharsets.UTF_8.name()),
            HtmlUtils.htmlEscape(set.description(), StandardCharsets.UTF_8.name()),
            HtmlUtils.htmlEscape(
                json.writeValueAsString(PublicSetPreviewResponse.from(preview)),
                StandardCharsets.UTF_8.name()));
        return beforePreview + metadata + afterPreview;
    }

    private Optional<PublicSetSummary.Preview> findReviewer(boolean shortLink, String identifier) {
        if (!publicCatalogPermits.tryAcquire()) {
            return Optional.empty();
        }
        try {
            return shortLink ? publicSets.summaryByShareCode(identifier) : publicSets.summary(identifier);
        } catch (CannotCreateTransactionException | DataAccessResourceFailureException _) {
            // The static app can still open and retry its catalog request after the database wakes up.
            return Optional.empty();
        } finally {
            publicCatalogPermits.release();
        }
    }
}
