package com.revue;

import java.util.List;
import org.springframework.boot.test.system.CapturedOutput;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Selects actual JSON events written by the configured console logger. */
public final class StructuredEvents {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private StructuredEvents() {
    }

    /** Returns captured console records with the given stable event name. */
    public static List<JsonNode> named(CapturedOutput output, String name) {
        return output.getOut()
            .lines()
            .filter(line -> line.startsWith("{"))
            .map(JSON::readTree)
            .filter(event -> name.equals(event.at("/event/name").asString()))
            .toList();
    }
}
