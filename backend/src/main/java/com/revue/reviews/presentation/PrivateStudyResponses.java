package com.revue.reviews.presentation;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/** Direct study responses avoid an early flush and second JDBC session lookup while retaining private cache headers. */
@ControllerAdvice(basePackageClasses = ReviewController.class)
class PrivateStudyResponses {
    @ModelAttribute
    void preventCaching(HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().cachePrivate().getHeaderValue());
    }
}
