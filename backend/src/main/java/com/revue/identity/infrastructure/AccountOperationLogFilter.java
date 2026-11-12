package com.revue.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Records auth command outcomes after Spring Session has finished saving or deleting the session. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class AccountOperationLogFilter extends OncePerRequestFilter {
    static final String AUTHENTICATED_LOGOUT = AccountOperationLogFilter.class.getName() + ".authenticatedLogout";

    private static final String LOGOUT_EVENT = "auth.logout";
    private static final String EVENT_NAME = "event.name";
    private static final String EVENT_OUTCOME = "event.outcome";
    private static final String EVENT_REASON = "event.reason";
    private static final String ENTITY_TYPE = "entity.type";
    private static final String SESSION = "session";
    private static final String FAILURE = "failure";

    private static final Logger LOG = LoggerFactory.getLogger(AccountOperationLogFilter.class);

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = path(request);
        return !path.startsWith("/api/") && !path.startsWith("/actuator/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String command = commandEvent(request);
        try (var _ = MDC.putCloseable("operation.id", UUID.randomUUID().toString())) {
            try {
                chain.doFilter(request, response);
            } catch (ServletException | IOException | RuntimeException ex) {
                if (command != null) {
                    LOG.atError()
                        .addKeyValue(EVENT_NAME, command)
                        .addKeyValue(EVENT_OUTCOME, FAILURE)
                        .addKeyValue(EVENT_REASON, "request_failed")
                        .log("Authentication request did not complete");
                }
                throw ex;
            }
            int status = response.getStatus();
            if (command != null) {
                logCommandResult(request, command, status);
            } else if (status == 401 || status == 403) {
                logAccessDenial(request, status);
            }
        }
    }

    private static void logCommandResult(HttpServletRequest request, String command, int status) {
        if (status >= 400) {
            logCommand(command, status < 500 ? "rejected" : FAILURE, reason(status), status);
        } else if (status == 200 && !LOGOUT_EVENT.equals(command)) {
            LOG.atInfo()
                .addKeyValue(EVENT_NAME, command)
                .addKeyValue(EVENT_OUTCOME, "success")
                .addKeyValue(ENTITY_TYPE, SESSION)
                .addKeyValue("state.from", "unknown")
                .addKeyValue("state.to", "authenticated")
                .log("Authentication session saved");
        } else if (status == 204 && request.getAttribute(AUTHENTICATED_LOGOUT) != null) {
            LOG.atInfo()
                .addKeyValue(EVENT_NAME, LOGOUT_EVENT)
                .addKeyValue(EVENT_OUTCOME, "success")
                .addKeyValue(ENTITY_TYPE, SESSION)
                .addKeyValue("state.from", "authenticated")
                .addKeyValue("state.to", "signed_out")
                .log("Authenticated session ended");
        } else if (status == 204) {
            logCommand(command, "no_change", "no_authenticated_session", status);
        }
    }

    private static void logAccessDenial(HttpServletRequest request, int status) {
        LOG.atInfo()
            .addKeyValue(EVENT_NAME, "auth.access_denied")
            .addKeyValue(EVENT_OUTCOME, "rejected")
            .addKeyValue(EVENT_REASON, reason(status))
            .addKeyValue("endpoint.group", path(request).startsWith("/actuator/") ? "operations" : "api")
            .addKeyValue("http.response.status_code", status)
            .log("Access denied");
    }

    private static void logCommand(String command, String outcome, String reason, int status) {
        var event = FAILURE.equals(outcome) ? LOG.atError() : LOG.atInfo();
        event.addKeyValue(EVENT_NAME, command)
            .addKeyValue(EVENT_OUTCOME, outcome)
            .addKeyValue(EVENT_REASON, reason)
            .addKeyValue(ENTITY_TYPE, SESSION)
            .addKeyValue("http.response.status_code", status)
            .log("Authentication command finished");
    }

    private static String reason(int status) {
        return switch (status) {
            case 400 -> "invalid_request_or_invitation";
            case 401 -> "authentication_required_or_rejected";
            case 403 -> "access_denied";
            case 409 -> "conflict";
            case 413 -> "request_too_large";
            case 429 -> "admission_limited";
            default -> "http_error";
        };
    }

    private static String commandEvent(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) {
            return null;
        }
        return switch (path(request)) {
            case "/api/v1/auth/register" -> "auth.register";
            case "/api/v1/auth/login" -> "auth.login";
            case "/api/v1/auth/logout" -> LOGOUT_EVENT;
            default -> null;
        };
    }

    private static String path(HttpServletRequest request) {
        return request.getRequestURI().substring(request.getContextPath().length());
    }
}
