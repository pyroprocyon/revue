package com.revue.content.infrastructure.persistence;

import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface JpaCardRepository extends JpaRepository<CardRow, Long> {

    @Query("select c from Card c where c.sharedSet = :set order by c.position, c.id")
    List<CardRow> findInSetOrdered(SharedSetRow set, Limit limit);

    @Query("select c from Card c where c.sharedSet = :set and c.retiredAt is " + "null order by c.position, c.id")
    List<CardRow> findActiveInSetOrdered(SharedSetRow set, Limit limit);
}
