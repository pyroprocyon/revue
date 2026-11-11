package com.revue.content.presentation;

import com.revue.content.application.DemoCards;
import com.revue.content.application.PublicSetService;
import com.revue.content.application.PublicSetSummary;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public, read-only endpoints behind the set list, each set's preview and its trial (plan section 10). They work
 * signed out and only ever serve active public sets.
 *
 * <p>An unknown or retired set answers 404, and the page shows its unavailable state. Responses are never cached, so a
 * browser never keeps a retired card.
 */
@RestController
@RequestMapping("/api/v1/public-sets")
class PublicSetController {

    private final PublicSetService publicSets;

    PublicSetController(PublicSetService publicSets) {
        this.publicSets = publicSets;
    }

    @GetMapping
    ResponseEntity<List<PublicSetSummary>> list() {
        return ok(publicSets.list());
    }

    @GetMapping("/{setKey}")
    ResponseEntity<PublicSetSummary> summary(@PathVariable String setKey) {
        return publicSets.summary(setKey).map(PublicSetController::ok).orElseGet(PublicSetController::notFound);
    }

    @GetMapping("/share/{shareCode}/summary")
    ResponseEntity<PublicSetSummary> sharedSummary(@PathVariable String shareCode) {
        return publicSets.summaryByShareCode(shareCode)
            .map(PublicSetController::ok)
            .orElseGet(PublicSetController::notFound);
    }

    @GetMapping("/{setKey}/demo-cards")
    ResponseEntity<DemoCards> demoCards(@PathVariable String setKey) {
        return publicSets.demoCards(setKey).map(PublicSetController::ok).orElseGet(PublicSetController::notFound);
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static <T> ResponseEntity<T> notFound() {
        return ResponseEntity.notFound().cacheControl(CacheControl.noStore()).build();
    }
}
