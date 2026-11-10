package com.revue.reviews.infrastructure.fsrs;

import com.revue.reviews.domain.DailyReviewScheduler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class SchedulingConfiguration {
    @Bean
    DailyReviewScheduler dailyReviewScheduler() {
        return new DailyReviewScheduler(new FsrsMemoryModel(true));
    }
}
