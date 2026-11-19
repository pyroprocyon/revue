-- Card cleanup and the cards foreign key look up review logs by card ID.
create index review_logs_card on review_logs(card_id);
