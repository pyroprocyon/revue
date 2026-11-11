package com.revue.content.infrastructure.persistence;

import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface JpaCardRepository extends JpaRepository<CardRow, Long> {

    @Query("select c from Card c join fetch c.sharedSet order by c.position, c.id")
    List<CardRow> findAllWithSet();

    @Query("select c from Card c where c.sharedSet = :set and c.retiredAt is " + "null order by c.position, c.id")
    List<CardRow> findActiveInSetOrdered(SharedSetRow set, Limit limit);

    @Query("select count(c) from Card c where c.sharedSet = :set and c.retiredAt is null")
    long countActiveInSet(SharedSetRow set);

    /** One row per set that has active cards, so a list of sets needs one count query in total. */
    @Query("select c.sharedSet.id as setId, count(c) as cardCount from Card c where c.retiredAt is null"
        + " group by c.sharedSet.id")
    List<ActiveCardCount> countActiveCardsBySet();

    interface ActiveCardCount {

        Long getSetId();

        long getCardCount();
    }
}
