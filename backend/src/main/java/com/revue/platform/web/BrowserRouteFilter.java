package com.revue.platform.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpMethod;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * Serves the React app for browser routes, so reloading a page such as a review session loads the app instead of a 404.
 *
 * <p>A browser route is a GET or HEAD request outside {@code /api} and {@code /actuator} whose last path segment has no
 * file extension. This filter forwards it to {@code /index.html}. A request for a file, such as a missing asset, passes
 * through and gets 404, so a tab left open across a deploy fails clearly instead of loading HTML as JavaScript.
 *
 * <p>Only the home page, the list of sets and each set's preview, such as {@code /sets/philippine-history}, may appear
 * in search results. Every browser route shares one index.html, so a noindex tag inside it would hide the home page
 * too. This filter sends an {@code X-Robots-Tag: noindex} header on the other routes instead, including each set's
 * trial.
 *
 * <p>The filter runs after Spring Security, whose firewall has already rejected malformed paths, such as encoded
 * slashes or {@code ..} segments.
 */
@Component
class BrowserRouteFilter extends OncePerRequestFilter {

    private static final String INDEX_PAGE = "/index.html";

    private static final PathPattern API = PathPatternParser.defaultInstance.parse("/api/**");
    private static final PathPattern OPERATIONS = PathPatternParser.defaultInstance.parse("/actuator/**");
    private static final Set<String> INDEXABLE_ROUTES = Set.of("/", "/sets");

    // A set preview: /sets/ followed by one set key, which content rules limit to these characters.
    private static final Pattern SET_PREVIEW = Pattern.compile("/sets/[a-z0-9]++(?:-[a-z0-9]++)*+");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !isBrowserRoute(request.getMethod(), pathOf(request));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (!isIndexable(pathOf(request))) {
            response.setHeader("X-Robots-Tag", "noindex");
        }
        request.getRequestDispatcher(INDEX_PAGE).forward(request, response);
    }

    private static boolean isBrowserRoute(String method, String path) {
        if (!HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method)) {
            return false;
        }
        var parsed = PathContainer.parsePath(path);
        if (API.matches(parsed) || OPERATIONS.matches(parsed)) {
            return false;
        }
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        return lastSegment.indexOf('.') < 0;
    }

    private static boolean isIndexable(String path) {
        return INDEXABLE_ROUTES.contains(path) || SET_PREVIEW.matcher(path).matches();
    }

    private static String pathOf(HttpServletRequest request) {
        return request.getRequestURI().substring(request.getContextPath().length());
    }
}
