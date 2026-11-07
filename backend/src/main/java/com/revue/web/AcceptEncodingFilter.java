package com.revue.web;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

import org.jspecify.annotations.Nullable;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Removes the compression formats a client rejected from its Accept-Encoding header, before Spring
 * picks a precompressed file.
 *
 * <p>Spring's {@code EncodedResourceResolver} only checks whether the header mentions "br" or
 * "gzip", and its resource cache key drops quality values too. So {@code gzip;q=0}, which rejects
 * gzip (RFC 9110, section 12.5.3), would still get the .gz copy. This filter shows Spring a header
 * that lists only the formats the build provides, br and gzip, each only when the client accepts
 * it. With neither left, the request has no Accept-Encoding header and gets the plain file.
 *
 * <p>It runs before {@link BrowserRouteFilter}, so a browser route forwarded to index.html keeps
 * the cleaned header.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1)
class AcceptEncodingFilter extends OncePerRequestFilter {

	private static final List<String> SERVED_CODINGS = List.of("br", "gzip");

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain chain) throws ServletException, IOException {
		String header = request.getHeader(HttpHeaders.ACCEPT_ENCODING);
		chain.doFilter(header == null ? request : new CleanedRequest(request, acceptedCodings(header)), response);
	}

	/**
	 * Returns the served codings the header accepts, such as {@code "br, gzip"}, or null for none.
	 * A coding is accepted when it has no weight or a weight above zero. A weight that doesn't
	 * parse counts as a rejection, and an empty entry is skipped, because the plain file is always
	 * safe to send.
	 */
	static @Nullable String acceptedCodings(String header) {
		Set<String> accepted = new LinkedHashSet<>();
		for (String item : header.split(",")) {
			String[] parts = item.split(";");
			if (parts.length == 0) {
				// An entry of only semicolons, such as ";", splits into nothing.
				continue;
			}
			String coding = parts[0].trim().toLowerCase(Locale.ROOT);
			if (coding.equals("x-gzip")) {
				coding = "gzip";
			}
			if (SERVED_CODINGS.contains(coding) && hasPositiveWeight(parts)) {
				accepted.add(coding);
			}
		}
		return accepted.isEmpty() ? null : String.join(", ", accepted);
	}

	private static boolean hasPositiveWeight(String[] parts) {
		for (int i = 1; i < parts.length; i++) {
			String parameter = parts[i].trim();
			if (parameter.regionMatches(true, 0, "q=", 0, 2)) {
				try {
					return Double.parseDouble(parameter.substring(2).trim()) > 0;
				}
				catch (NumberFormatException ex) {
					return false;
				}
			}
		}
		return true;
	}

	/** The original request, with Accept-Encoding replaced by the cleaned value or removed. */
	private static final class CleanedRequest extends HttpServletRequestWrapper {

		private final @Nullable String acceptEncoding;

		CleanedRequest(HttpServletRequest request, @Nullable String acceptEncoding) {
			super(request);
			this.acceptEncoding = acceptEncoding;
		}

		@Override
		public @Nullable String getHeader(String name) {
			return isAcceptEncoding(name) ? acceptEncoding : super.getHeader(name);
		}

		@Override
		public Enumeration<String> getHeaders(String name) {
			if (!isAcceptEncoding(name)) {
				return super.getHeaders(name);
			}
			return acceptEncoding == null ? Collections.emptyEnumeration()
					: Collections.enumeration(List.of(acceptEncoding));
		}

		@Override
		public Enumeration<String> getHeaderNames() {
			if (acceptEncoding != null) {
				return super.getHeaderNames();
			}
			List<String> names = Collections.list(super.getHeaderNames());
			names.removeIf(CleanedRequest::isAcceptEncoding);
			return Collections.enumeration(names);
		}

		private static boolean isAcceptEncoding(String name) {
			return HttpHeaders.ACCEPT_ENCODING.equalsIgnoreCase(name);
		}

	}

}
