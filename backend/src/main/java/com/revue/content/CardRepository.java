package com.revue.content;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface CardRepository extends JpaRepository<Card, Long> {

	@Query("select c from Card c join fetch c.sharedSet where c.contentKey in :keys")
	List<Card> findByContentKeyIn(Collection<String> keys);

	@Query("select c from Card c where c.sharedSet = :set order by c.position, c.id")
	List<Card> findBySetOrdered(SharedSet set);

}
