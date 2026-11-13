package com.revue.reviews.presentation;

import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.LibraryService;
import com.revue.reviews.application.LibraryStore;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Private library endpoints; session eligibility and CSRF are enforced by security filters. */
@RestController
public class LibraryController {
    private final LibraryService library;

    /** Creates the HTTP adapter. */
    public LibraryController(LibraryService library) {
        this.library = library;
    }

    @PostMapping("/api/v1/sets/{id}/save")
    ResponseEntity<LibraryStore.SavedSet> save(@PathVariable long id) {
        return ok(library.save(id));
    }

    @DeleteMapping("/api/v1/sets/{id}/save")
    ResponseEntity<Void> remove(@PathVariable long id) {
        library.remove(id);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build();
    }

    @GetMapping("/api/v1/sets/{id}/save")
    ResponseEntity<Membership> saved(@PathVariable long id) {
        return ok(new Membership(library.saved(id)));
    }

    @GetMapping("/api/v1/me/saved-sets")
    ResponseEntity<LibraryService.Page> list(
        @RequestParam(defaultValue = "0") long after,
        @RequestParam(defaultValue = "20") int limit) {
        return ok(library.list(after, limit));
    }

    record Membership(boolean saved) {
    }

    @ExceptionHandler(LibraryProblem.class)
    ResponseEntity<ProblemDetail> problem(LibraryProblem problem) {
        HttpStatus status = switch (problem.kind()) {
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case UNAVAILABLE -> HttpStatus.NOT_FOUND;
            case INVALID_PAGE -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ProblemDetail.forStatus(status));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }
}
