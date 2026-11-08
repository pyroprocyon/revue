package com.revue.content;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface CardRepository extends JpaRepository<Card, Long> {

	@Query("select c from Card c join fetch c.sharedSet where c.contentKey in :keys")
	List<Card> findByContentKeyIn(Collection<String> keys);

	@Query("select c from Card c where c.sharedSet = :set order by c.position, c.id")
	List<Card> findBySetOrdered(SharedSet set);

	@Query("select c from Card c where c.sharedSet = :set and c.retiredAt is null order by c.position, c.id")
	List<Card> findActiveInSetOrdered(SharedSet set, Limit limit);

	@Query("select count(c) from Card c where c.sharedSet = :set and c.retiredAt is null")
	long countActiveInSet(SharedSet set);

	/** One row per set that has active cards, so a list of sets needs one count query in total. */
	@Query("select c.sharedSet.id as setId, count(c) as cardCount from Card c where c.retiredAt is null"
			+ " group by c.sharedSet.id")
	List<ActiveCardCount> countActiveCardsBySet();

	interface ActiveCardCount {

		Long getSetId();

		long getCardCount();

	}

}
