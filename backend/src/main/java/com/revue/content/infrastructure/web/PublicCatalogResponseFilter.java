package com.revue.content.infrastructure.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

/**
 * Sends public catalog responses with a known length. Tomcat applies the compression size threshold only to those, so
 * a streamed page below it would still be gzipped and could come back larger.
 *
 * <p>A trial is tagged here, after Spring has chosen its media type, because Spring compares a controller's tag before
 * choosing one. The tag covers that type, so a copy cached for one {@code Accept} never answers another.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 41)
class PublicCatalogResponseFilter extends OncePerRequestFilter {
    private final PathPatternRequestMatcher catalog = PathPatternRequestMatcher.withDefaults()
        .matcher("/api/v1/public-sets/**");
    private final PathPatternRequestMatcher trial = PathPatternRequestMatcher.withDefaults()
        .matcher("/api/v1/public-sets/{setKey}/demo-cards");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !catalog.matches(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        var buffered = new ContentCachingResponseWrapper(response);
        chain.doFilter(request, buffered);
        boolean servedTrial = trial.matches(request) && buffered.getStatus() == HttpServletResponse.SC_OK;
        if (servedTrial && new ServletWebRequest(request, response).checkNotModified(representationTag(buffered))) {
            return;
        }
        buffered.copyBodyToResponse();
    }

    private static String representationTag(ContentCachingResponseWrapper response) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(Objects.toString(response.getContentType(), "").getBytes(StandardCharsets.UTF_8));
            digest.update(response.getContentAsByteArray());
            return "W/\"" + HexFormat.of().formatHex(digest.digest()) + "\"";
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
