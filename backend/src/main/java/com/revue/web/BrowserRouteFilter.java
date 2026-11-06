package com.revue.web;

import java.io.IOException;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Serves the React app for browser routes, so reloading a page such as a review session loads the
 * app instead of a 404.
 *
 * <p>A browser route is a GET or HEAD request outside {@code /api} and {@code /actuator} whose last
 * path segment has no file extension. This filter forwards it to {@code /index.html}. A request
 * for a file, such as a missing asset, passes through and gets 404, so a tab left open across a
 * deploy fails clearly instead of loading HTML as JavaScript.
 *
 * <p>Only the home page and the starter preview may appear in search results. Every browser route
 * shares one index.html, so a noindex tag inside it would hide the home page too. This filter
 * sends an {@code X-Robots-Tag: noindex} header on the other routes instead.
 *
 * <p>The filter runs after Spring Security, whose firewall has already rejected malformed paths,
 * such as encoded slashes or {@code ..} segments.
 */
@Component
class BrowserRouteFilter extends OncePerRequestFilter {

	private static final String INDEX_PAGE = "/index.html";

	private static final Set<String> INDEXABLE_ROUTES = Set.of("/", "/starter-set");

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !isBrowserRoute(request.getMethod(), pathOf(request));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain chain) throws ServletException, IOException {
		if (!INDEXABLE_ROUTES.contains(pathOf(request))) {
			response.setHeader("X-Robots-Tag", "noindex");
		}
		request.getRequestDispatcher(INDEX_PAGE).forward(request, response);
	}

	static boolean isBrowserRoute(String method, String path) {
		if (!HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method)) {
			return false;
		}
		if (isUnder(path, "/api") || isUnder(path, "/actuator")) {
			return false;
		}
		String lastSegment = path.substring(path.lastIndexOf('/') + 1);
		return lastSegment.indexOf('.') < 0;
	}

	private static boolean isUnder(String path, String prefix) {
		return path.equals(prefix) || path.startsWith(prefix + "/");
	}

	private static String pathOf(HttpServletRequest request) {
		return request.getRequestURI().substring(request.getContextPath().length());
	}

}
