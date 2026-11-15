package com.revue.platform.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.content.domain.SetDefinition;
import com.revue.content.infrastructure.files.PublicContent;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class BrowserRouteFilterTests {
    @Test
    void everyPublishedSetPreviewCanBeIndexed() throws Exception {
        var filter = new BrowserRouteFilter();
        for (SetDefinition set : PublicContent.readAndCheck()) {
            var response = new MockHttpServletResponse();

            filter
                .doFilter(new MockHttpServletRequest("GET", "/sets/" + set.setKey()), response, (request, ignored) -> {
                });

            assertThat(response.getHeader("X-Robots-Tag")).as(set.setKey()).isNull();
        }
    }

    @Test
    void longPreviewKeysRetainIndexingRulesWithoutRecursiveBacktracking() throws Exception {
        String path = "/sets/" + "a-".repeat(10_000) + "z";
        var valid = new MockHttpServletResponse();
        var invalid = new MockHttpServletResponse();
        var filter = new BrowserRouteFilter();

        filter.doFilter(new MockHttpServletRequest("GET", path), valid, (request, response) -> {
        });
        filter.doFilter(new MockHttpServletRequest("GET", path + "-"), invalid, (request, response) -> {
        });

        assertThat(valid.getForwardedUrl()).isEqualTo("/index.html");
        assertThat(valid.getHeader("X-Robots-Tag")).isNull();
        assertThat(invalid.getHeader("X-Robots-Tag")).isEqualTo("noindex");
    }
}
