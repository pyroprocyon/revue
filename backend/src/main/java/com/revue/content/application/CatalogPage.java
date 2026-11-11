package com.revue.content.application;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** A bounded alphabetical page and an opaque continuation cursor. */
public record CatalogPage(List<PublicSetSummary> items, @Nullable String nextCursor) {
}
