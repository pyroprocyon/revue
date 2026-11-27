package com.revue.identity.presentation;

import com.revue.identity.application.AccountProblem;
import org.springframework.http.HttpHeaders;
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
        HttpStatus status = switch (problem.kind()) {
            case INVALID_CREDENTIALS -> HttpStatus.UNAUTHORIZED;
            case UNAVAILABLE_USERNAME -> HttpStatus.CONFLICT;
            case AUTHENTICATION_BUSY, OVERLOADED -> HttpStatus.TOO_MANY_REQUESTS;
        };
        var builder = ResponseEntity.status(status);
        if (status == HttpStatus.TOO_MANY_REQUESTS) {
            builder.header(
                HttpHeaders.RETRY_AFTER,
                problem.kind() == AccountProblem.Kind.AUTHENTICATION_BUSY ? "1" : "60");
        }
        return builder.body(ProblemDetail.forStatusAndDetail(status, problem.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidInput(IllegalArgumentException problem) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, problem.getMessage());
    }
}
