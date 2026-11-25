package com.revue;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;
import org.springframework.http.HttpHeaders;

/** Client preferences across all Accept-Encoding header lines (RFC 9110, section 12.5.3). */
public final class AcceptedEncodings {
    private static final String IDENTITY = "identity";
    private final Map<String, Double> weights = new HashMap<>();

    private AcceptedEncodings(String header) {
        for (String item : header.split(",")) {
            String[] parts = item.split(";", -1);
            String coding = parts[0].trim().toLowerCase(Locale.ROOT);
            weights.merge(coding.equals("x-gzip") ? "gzip" : coding, weight(parts), Math::max);
        }
    }

    /** Reads the client's coding preferences in one pass. */
    public static AcceptedEncodings from(HttpServletRequest request) {
        var headers = request.getHeaders(HttpHeaders.ACCEPT_ENCODING);
        return new AcceptedEncodings(headers == null ? "" : String.join(", ", Collections.list(headers)));
    }

    /** Returns acceptable representations in preference order, using the server's order to break ties. */
    public List<String> preferred(List<String> supported) {
        double wildcard = weights.getOrDefault("*", 0.0);
        var ranked = supported.stream()
            .filter(coding -> preference(coding, wildcard) > 0)
            .sorted(Comparator.comparingDouble((String coding) -> preference(coding, wildcard)).reversed());
        if (supported.contains(IDENTITY) && !weights.containsKey(IDENTITY) && weights.getOrDefault("*", 1.0) > 0) {
            return Stream.concat(ranked, Stream.of(IDENTITY)).toList();
        }
        return ranked.toList();
    }

    private double preference(String coding, double wildcard) {
        return weights.getOrDefault(coding, coding.equals(IDENTITY) ? 0.0 : wildcard);
    }

    private static double weight(String[] parts) {
        for (int i = 1; i < parts.length; i++) {
            String parameter = parts[i].trim();
            if (parameter.regionMatches(true, 0, "q=", 0, 2)) {
                try {
                    double value = Double.parseDouble(parameter.substring(2).trim());
                    return value > 0 && value <= 1 ? value : 0;
                } catch (NumberFormatException _) {
                    return 0;
                }
            }
        }
        return 1;
    }
}
