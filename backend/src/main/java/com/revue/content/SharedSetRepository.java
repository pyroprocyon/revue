package com.revue.content;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface SharedSetRepository extends JpaRepository<SharedSet, Long> {

	Optional<SharedSet> findBySetKey(String setKey);

	@Query("select s from SharedSet s where s.setKey = :setKey and s.retiredAt is null")
	Optional<SharedSet> findActiveBySetKey(String setKey);

	@Query("select s from SharedSet s where s.retiredAt is null order by s.title, s.id")
	List<SharedSet> findAllActiveByTitle();

}
