package com.revue.reviews.presentation;

import com.revue.reviews.application.DeckProblem;
import com.revue.reviews.application.DeckService;
import com.revue.reviews.application.DeckStore;
import com.revue.reviews.application.LibraryProblem;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Private personal-deck endpoints; session eligibility and CSRF are enforced by security filters. */
@RestController
public class DeckController {
    private final DeckService decks;

    public DeckController(DeckService decks) {
        this.decks = decks;
    }

    @GetMapping("/api/v1/decks")
    DeckList list() {
        return new DeckList(decks.decks());
    }

    @PostMapping("/api/v1/decks")
    ResponseEntity<DeckStore.Deck> create(
        @RequestBody DeckService.DeckDraft draft,
        @RequestHeader(name = "Idempotency-Key", required = false) @Nullable UUID requestId) {
        return privateResponse(HttpStatus.CREATED, decks.createDeck(draft, requestId));
    }

    @PatchMapping("/api/v1/decks/{id}")
    ResponseEntity<DeckStore.Deck> rename(@PathVariable long id, @RequestBody DeckService.DeckDraft draft) {
        return privateResponse(HttpStatus.OK, decks.renameDeck(id, draft));
    }

    @PutMapping("/api/v1/decks/{id}/archive")
    ResponseEntity<Void> archive(@PathVariable long id) {
        decks.setArchived(id, true);
        return privateResponse(HttpStatus.NO_CONTENT, null);
    }

    @DeleteMapping("/api/v1/decks/{id}/archive")
    ResponseEntity<Void> restore(@PathVariable long id) {
        decks.setArchived(id, false);
        return privateResponse(HttpStatus.NO_CONTENT, null);
    }

    @DeleteMapping("/api/v1/decks/{id}")
    ResponseEntity<Void> delete(@PathVariable long id) {
        decks.deleteDeck(id);
        return privateResponse(HttpStatus.NO_CONTENT, null);
    }

    @GetMapping("/api/v1/decks/{id}/cards")
    DeckService.CardPage cards(
        @PathVariable long id,
        @RequestParam(defaultValue = "0") long after,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(name = "q", defaultValue = "") String search,
        @RequestParam(defaultValue = "false") boolean due) {
        return decks.cards(id, after, limit, search, due);
    }

    @PostMapping("/api/v1/decks/{id}/cards")
    ResponseEntity<DeckStore.Card> addCard(
        @PathVariable long id,
        @RequestBody DeckService.CardDraft draft,
        @RequestHeader(name = "Idempotency-Key", required = false) @Nullable UUID requestId) {
        return privateResponse(HttpStatus.CREATED, decks.addCard(id, draft, requestId));
    }

    @PatchMapping("/api/v1/cards/{id}")
    ResponseEntity<DeckStore.Card> editCard(
        @PathVariable long id,
        @RequestBody DeckService.CardDraft draft,
        @RequestHeader(name = "X-Content-Version", required = false) @Nullable Integer expectedVersion) {
        return privateResponse(HttpStatus.OK, decks.editCard(id, draft, expectedVersion));
    }

    @DeleteMapping("/api/v1/cards/{id}")
    ResponseEntity<Void> deleteCard(@PathVariable long id) {
        decks.deleteCard(id);
        return privateResponse(HttpStatus.NO_CONTENT, null);
    }

    record DeckList(List<DeckStore.Deck> items) {
    }

    @ExceptionHandler(DeckProblem.class)
    ResponseEntity<ProblemDetail> problem(DeckProblem problem) {
        HttpStatus status = switch (problem.kind()) {
            case INVALID_TEXT -> HttpStatus.UNPROCESSABLE_CONTENT;
            case INVALID_PAGE -> HttpStatus.BAD_REQUEST;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case DECK_LIMIT, CARD_LIMIT, STALE_CARD, CREATE_CONFLICT -> HttpStatus.CONFLICT;
        };
        var body = ProblemDetail.forStatus(status);
        body.setProperty("reason", problem.kind().name());
        return privateResponse(status, body);
    }

    @ExceptionHandler(LibraryProblem.class)
    ResponseEntity<Void> unauthenticated() {
        return privateResponse(HttpStatus.UNAUTHORIZED, null);
    }

    private static <T> ResponseEntity<T> privateResponse(HttpStatus status, T body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }
}
