package com.revue.platform.infrastructure;

import java.util.HashMap;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroup;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroups;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroupsPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Keeps existing health pollers from waking a suspended database. */
@Configuration(proxyBeanMethods = false)
class HealthProbeConfig {
    @Bean
    HealthEndpointGroupsPostProcessor useLivenessForDefaultHealth() {
        return groups -> {
            var namedGroups = new HashMap<String, HealthEndpointGroup>();
            for (String name : groups.getNames()) {
                namedGroups.put(name, groups.get(name));
            }
            return HealthEndpointGroups.of(namedGroups.get("liveness"), namedGroups);
        };
    }
}
