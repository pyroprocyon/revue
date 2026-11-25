package com.revue.content.presentation;

import com.revue.content.application.PublicSetQueries;
import com.revue.content.application.PublicSetService;
import com.revue.content.application.PublicSetSummary;
import com.revue.content.application.TrialCards;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The public, read-only endpoints behind the set list, each set's preview and its trial (plan section 10). They work
 * signed out and only ever serve active public sets.
 *
 * <p>An unknown or retired set answers 404, and the page shows its unavailable state. Trial responses require server
 * revalidation before reuse, so a cached response cannot hide retirement or changed content. Their validator comes from
 * the catalog response filter, after Spring has chosen the media type.
 */
@RestController
@RequestMapping("/api/v1/public-sets")
class PublicSetController {

    private final PublicSetService publicSets;

    PublicSetController(PublicSetService publicSets) {
        this.publicSets = publicSets;
    }

    @GetMapping
    ResponseEntity<List<PublicSetSummary>> list(
        @RequestParam(required = false) @Nullable String after,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(defaultValue = "false") boolean published,
        @RequestParam(required = false) @Nullable String subject,
        @RequestParam(defaultValue = "") String q) {
        try {
            String search = q.strip();
            var page = publicSets.list(after, limit, published, subject, search);
            var response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
            if (page.nextCursor() != null) {
                response.header("X-Next-Cursor", page.nextCursor());
                response.header(
                    "Link",
                    "</api/v1/public-sets?limit=" + limit + "&after=" + page.nextCursor()
                        + (published ? "&published=true" : "")
                        + (subject == null ? "" : "&subject=" + URLEncoder.encode(subject, StandardCharsets.UTF_8))
                        + (search.isEmpty() ? "" : "&q=" + URLEncoder.encode(search, StandardCharsets.UTF_8))
                        + ">; rel=\"next\"");
            }
            return response.body(page.items());
        } catch (IllegalArgumentException _) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid catalog page");
        }
    }

    @GetMapping("/catalog/subjects")
    ResponseEntity<List<PublicSetQueries.Subject>> subjects() {
        return ok(publicSets.subjects());
    }

    @GetMapping("/catalog/onboarding")
    ResponseEntity<List<PublicSetSummary>> onboarding() {
        return ok(publicSets.onboarding());
    }

    @GetMapping("/{setKey}")
    ResponseEntity<PublicSetPreviewResponse> summary(@PathVariable String setKey) {
        return publicSets.summary(setKey)
            .map(PublicSetPreviewResponse::from)
            .map(PublicSetController::ok)
            .orElseGet(PublicSetController::notFound);
    }

    @GetMapping("/share/{shareCode}/summary")
    ResponseEntity<PublicSetPreviewResponse> sharedSummary(@PathVariable String shareCode) {
        return publicSets.summaryByShareCode(shareCode)
            .map(PublicSetPreviewResponse::from)
            .map(PublicSetController::ok)
            .orElseGet(PublicSetController::notFound);
    }

    @GetMapping("/{setKey}/demo-cards")
    ResponseEntity<TrialCards> trialCards(@PathVariable String setKey) {
        return publicSets.trialCards(setKey)
            .map(
                trial -> ResponseEntity.ok()
                    .cacheControl(CacheControl.noCache().cachePrivate().mustRevalidate())
                    .varyBy(HttpHeaders.ACCEPT)
                    .body(trial))
            .orElseGet(PublicSetController::notFound);
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static <T> ResponseEntity<T> notFound() {
        return ResponseEntity.notFound().cacheControl(CacheControl.noStore()).build();
    }
}
