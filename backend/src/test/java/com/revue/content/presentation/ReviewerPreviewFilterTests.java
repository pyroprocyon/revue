package com.revue.content.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.revue.content.application.PublicSetService;
import java.util.concurrent.Semaphore;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.CannotCreateTransactionException;
import tools.jackson.databind.json.JsonMapper;

class ReviewerPreviewFilterTests {
    @Test
    void anUnavailableCatalogStillLetsTheBrowserOpenTheApp() throws Exception {
        var catalog = mock(PublicSetService.class);
        when(catalog.summaryByShareCode("8")).thenThrow(new CannotCreateTransactionException("Database unavailable"));
        var chain = new MockFilterChain();
        var request = new MockHttpServletRequest("GET", "/s/8");
        var response = new MockHttpServletResponse();

        var permits = new Semaphore(1);
        new ReviewerPreviewFilter(catalog, permits, new JsonMapper()).doFilter(request, response, chain);

        assertThat(permits.availablePermits()).isEqualTo(1);
        assertThat(chain.getRequest()).isSameAs(request);
        assertThat(response.getContentAsByteArray()).isEmpty();
    }
}
