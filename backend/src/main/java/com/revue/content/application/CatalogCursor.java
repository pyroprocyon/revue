package com.revue.content.application;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.jspecify.annotations.Nullable;

/** Cursor ties equal titles by permanent ID. It is a position, never authorization. */
record CatalogCursor(String title, long id) {
    static CatalogCursor parse(@Nullable String value) {
        if (value == null) {
            return new CatalogCursor("", 0);
        }
        if (value.length() > 4096) {
            throw new IllegalArgumentException("Invalid catalog cursor");
        }
        String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
        int separator = decoded.lastIndexOf('\0');
        if (separator < 0 || decoded.indexOf('\0') != separator) {
            throw new IllegalArgumentException("Invalid catalog cursor");
        }
        long id = Long.parseLong(decoded.substring(separator + 1));
        if (id < 1) {
            throw new IllegalArgumentException("Invalid catalog cursor");
        }
        return new CatalogCursor(decoded.substring(0, separator), id);
    }

    String encode() {
        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString((title + '\0' + id).getBytes(StandardCharsets.UTF_8));
    }
}
