-- Use a learner and date lookup for each day in Study rhythm.
create index review_logs_study_day on review_logs(user_id, local_review_date);
