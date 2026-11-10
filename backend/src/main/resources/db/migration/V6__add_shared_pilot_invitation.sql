ALTER TABLE signup_invites ADD COLUMN reusable boolean NOT NULL DEFAULT false;

ALTER TABLE signup_invites ADD CONSTRAINT signup_invites_reusable_has_no_redemption
    CHECK (NOT reusable OR (redeemed_at IS NULL AND redeemed_by_user_id IS NULL));

CREATE UNIQUE INDEX signup_invites_one_shared_link ON signup_invites (reusable)
    WHERE reusable AND revoked_at IS NULL;
