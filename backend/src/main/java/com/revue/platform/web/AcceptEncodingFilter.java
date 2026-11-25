package com.revue.platform.web;

import com.revue.AcceptedEncodings;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Removes the compression formats a client rejected from its Accept-Encoding header, before Spring picks a
 * precompressed file.
 *
 * <p>Spring's {@code EncodedResourceResolver} only checks whether the header mentions "br" or "gzip", and its resource
 * cache key drops quality values too. So {@code gzip;q=0}, which rejects gzip (RFC 9110, section 12.5.3), would still
 * get the .gz copy. And {@code *;q=1, identity;q=0}, which accepts every format it doesn't name but refuses the plain
 * file, would get the plain file. This filter shows Spring a header that lists only the formats the build provides, br
 * and gzip, each only when the client accepts it. With neither left, the request has no Accept-Encoding header and gets
 * the plain file. That includes a client that refuses the plain file too, because the RFC lets a server send its
 * default response instead of a 406.
 *
 * <p>It runs before {@link BrowserRouteFilter}, so a browser route forwarded to index.html keeps the cleaned header.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1)
class AcceptEncodingFilter extends OncePerRequestFilter {

    private static final List<String> SERVED_CODINGS = List.of("br", "gzip");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (request.getHeader(HttpHeaders.ACCEPT_ENCODING) == null) {
            chain.doFilter(request, response);
            return;
        }
        var preferred = AcceptedEncodings.from(request).preferred(SERVED_CODINGS);
        String header = preferred.isEmpty() ? null : String.join(", ", preferred);
        chain.doFilter(new CleanedRequest(request, header), response);
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
            return acceptEncoding == null
                ? Collections.emptyEnumeration()
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
