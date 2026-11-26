package com.revue.reviews.application;

import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Initializes missing schedules under the learner lock after a queue read detects them. */
@Service
class ScheduleRepair {
    private final LearnerAccess learners;
    private final ReviewStore store;
    private final MemoryModel memory;

    ScheduleRepair(LearnerAccess learners, ReviewStore store, MemoryModel memory) {
        this.learners = learners;
        this.store = store;
        this.memory = memory;
    }

    @Transactional
    public void initializeMissing(@Nullable String topic) {
        store.initialize(learners.lockCurrent(), DailyReviewScheduler.PROFILE, memory.initialState(), topic);
    }
}
