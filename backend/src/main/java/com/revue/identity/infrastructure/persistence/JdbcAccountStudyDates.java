package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.AccountStudyDates;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Updates only identity's study dates, joining the committed-review transaction. */
@Repository
public class JdbcAccountStudyDates implements AccountStudyDates {
    private final JdbcTemplate jdbc;

    /** Creates the identity-owned writer. */
    public JdbcAccountStudyDates(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordStudyDay(UUID learner, LocalDate day) {
        jdbc.update("""
            update users set first_study_date = coalesce(first_study_date, ?),
                second_study_date = case when second_study_date is null and first_study_date < ?
                    then ? else second_study_date end
            where id = ?
            """, day, day, day, learner);
    }
}
