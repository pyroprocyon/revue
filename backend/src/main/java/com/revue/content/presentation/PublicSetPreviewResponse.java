package com.revue.content.presentation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.revue.content.application.PublicSetSummary;
import org.jspecify.annotations.Nullable;

record PublicSetPreviewResponse(
    @JsonUnwrapped PublicSetSummary summary,
    @JsonInclude(JsonInclude.Include.NON_NULL) @Nullable String sampleQuestion) {

    static PublicSetPreviewResponse from(PublicSetSummary.Preview preview) {
        return new PublicSetPreviewResponse(preview.summary(), preview.sampleQuestion());
    }
}
