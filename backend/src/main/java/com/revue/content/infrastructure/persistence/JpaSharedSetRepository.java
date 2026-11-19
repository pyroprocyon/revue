package com.revue.content.infrastructure.persistence;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface JpaSharedSetRepository extends JpaRepository<SharedSetRow, Long> {

    Optional<SharedSetRow> findBySetKey(String setKey);

    @Query("select s from SharedSet s where s.setKey = :setKey and s.retiredAt is null")
    Optional<SharedSetRow> findActiveBySetKey(String setKey);
}
