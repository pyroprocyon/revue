package com.revue.platform.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.LivenessState;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Observes process availability and existing readiness probes without initiating database checks. */
@Component
class ServiceHealthLog extends OncePerRequestFilter {
    private static final Logger LOG = LoggerFactory.getLogger(ServiceHealthLog.class);

    private final String instanceId = UUID.randomUUID().toString();
    private final Map<String, String> lastStates = new HashMap<>();

    @EventListener
    void readinessChanged(AvailabilityChangeEvent<ReadinessState> event) {
        recordState("readiness", event.getState().name(), false);
    }

    @EventListener
    void livenessChanged(AvailabilityChangeEvent<LivenessState> event) {
        recordState("liveness", event.getState().name(), event.getState() == LivenessState.BROKEN);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals(request.getContextPath() + "/actuator/health/readiness");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        chain.doFilter(request, response);
        int status = response.getStatus();
        if (status == 200 || status == 503) {
            recordState("readiness_probe", status == 200 ? "UP" : "UNAVAILABLE", status == 503);
        }
    }

    private synchronized void recordState(String check, String current, boolean degraded) {
        String previous = lastStates.put(check, current);
        if (current.equals(previous)) {
            return;
        }
        var event = degraded ? LOG.atWarn() : LOG.atInfo();
        if (MDC.get("operation.id") == null) {
            event.addKeyValue("operation.id", UUID.randomUUID().toString());
        }
        event.addKeyValue("event.name", "service.availability_changed")
            .addKeyValue("event.outcome", degraded ? "degraded" : "observed")
            .addKeyValue("entity.type", check)
            .addKeyValue("entity.id", instanceId)
            .addKeyValue("state.from", previous == null ? "unknown" : previous)
            .addKeyValue("state.to", current)
            .log("Service availability observed");
    }
}
