package com.revue.content.infrastructure.persistence;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface JpaSharedSetRepository extends JpaRepository<SharedSetRow, Long> {

    Optional<SharedSetRow> findBySetKey(String setKey);

    @Query("select s from SharedSet s where s.setKey = :setKey and s.retiredAt is null")
    Optional<SharedSetRow> findActiveBySetKey(String setKey);

    @Query("select s from SharedSet s where s.id = :id and s.retiredAt is null")
    Optional<SharedSetRow> findActiveById(long id);

    @Query("select s from SharedSet s where s.retiredAt is null order by s.title, s.id")
    List<SharedSetRow> findFirstPage(Limit limit);

    @Query(value = "SELECT * FROM sets WHERE retired_at IS NULL AND (title, id) > (:afterTitle, :afterId) ORDER BY"
        + " title, id", nativeQuery = true)
    List<SharedSetRow> findAfterTitle(String afterTitle, long afterId, Limit limit);
}
