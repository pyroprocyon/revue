package com.revue.content.infrastructure.persistence;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface JpaSharedSetRepository extends JpaRepository<SharedSetRow, Long> {

    Optional<SharedSetRow> findBySetKey(String setKey);
}
