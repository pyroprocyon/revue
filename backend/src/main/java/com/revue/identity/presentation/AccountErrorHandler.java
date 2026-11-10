package com.revue.identity.presentation;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.RegistrationUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Translates account failures into safe HTTP problem responses. */
@RestControllerAdvice(assignableTypes = AccountController.class)
public class AccountErrorHandler {
    @ExceptionHandler(AccountProblem.class)
    ResponseEntity<ProblemDetail> accountProblem(AccountProblem problem) {
        HttpStatus status =
                switch (problem.kind()) {
                    case INVALID_CREDENTIALS -> HttpStatus.UNAUTHORIZED;
                    case UNAVAILABLE_USERNAME -> HttpStatus.CONFLICT;
                    case OVERLOADED -> HttpStatus.TOO_MANY_REQUESTS;
                };
        var builder = ResponseEntity.status(status);
        if (status == HttpStatus.TOO_MANY_REQUESTS) {
            builder.header("Retry-After", "60");
        }
        return builder.body(ProblemDetail.forStatusAndDetail(status, problem.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidInput(IllegalArgumentException problem) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, problem.getMessage());
    }

    @ExceptionHandler(RegistrationUnavailableException.class)
    ProblemDetail invalidInvitation() {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Use a valid invitation link or sign in to an existing account");
    }
}
