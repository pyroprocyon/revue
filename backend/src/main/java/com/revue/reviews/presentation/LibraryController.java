package com.revue.reviews.presentation;

import com.revue.reviews.application.DeckService;
import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.LibraryService;
import com.revue.reviews.application.LibraryStore;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Private library endpoints; session eligibility and CSRF are enforced by security filters. */
@RestController
public class LibraryController {
    private final LibraryService library;

    public LibraryController(LibraryService library) {
        this.library = library;
    }

    @PostMapping("/api/v1/sets/{id}/save")
    LibraryStore.SavedSet save(@PathVariable long id) {
        return library.save(id);
    }

    @DeleteMapping("/api/v1/sets/{id}/save")
    ResponseEntity<Void> remove(@PathVariable long id) {
        library.remove(id);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build();
    }

    @GetMapping("/api/v1/sets/{id}/save")
    Membership saved(@PathVariable long id) {
        return new Membership(library.saved(id));
    }

    @GetMapping("/api/v1/me/saved-sets")
    LibraryService.Page list(
        @RequestParam(defaultValue = "0") long after,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(required = false) @Nullable Boolean paused) {
        return library.list(after, limit, paused);
    }

    @GetMapping("/api/v1/me/saved-sets/keys")
    ResponseEntity<List<String>> savedKeys() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(library.savedKeys());
    }

    @GetMapping("/api/v1/me/saved-sets/{id}")
    LibraryStore.SavedSet detail(@PathVariable long id) {
        return library.detail(id);
    }

    @PutMapping("/api/v1/me/saved-sets/{id}/pause")
    ResponseEntity<Void> pause(@PathVariable long id) {
        return changeReviewPause(id, true);
    }

    @DeleteMapping("/api/v1/me/saved-sets/{id}/pause")
    ResponseEntity<Void> resume(@PathVariable long id) {
        return changeReviewPause(id, false);
    }

    private ResponseEntity<Void> changeReviewPause(long id, boolean paused) {
        library.setReviewsPaused(id, paused);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build();
    }

    @GetMapping("/api/v1/me/saved-sets/{id}/cards")
    ResponseEntity<DeckService.CardPage> cards(
        @PathVariable long id,
        @RequestParam(defaultValue = "0") long after,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(name = "q", defaultValue = "") String search,
        @RequestParam(defaultValue = "false") boolean due) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore().cachePrivate())
            .body(library.cards(id, after, limit, search, due));
    }

    record Membership(boolean saved) {
    }

    @ExceptionHandler(LibraryProblem.class)
    ResponseEntity<ProblemDetail> problem(LibraryProblem problem) {
        HttpStatus status = switch (problem.kind()) {
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case UNAVAILABLE -> HttpStatus.NOT_FOUND;
            case INVALID_PAGE -> HttpStatus.BAD_REQUEST;
            case SAVED_SET_LIMIT -> HttpStatus.CONFLICT;
        };
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ProblemDetail.forStatus(status));
    }
}
