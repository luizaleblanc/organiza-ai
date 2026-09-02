package com.organiza.mod_transaction.repository;

import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.model.TransactionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface TransactionEntityRepository extends JpaRepository<TransactionEntity, UUID> {

    List<TransactionEntity> findAllByCategoryAndUserId(Category category, String userId);

    @Query("SELECT SUM(t.amount) FROM TransactionEntity t WHERE t.category = :category AND t.userId = :userId")
    Double sumAmountByCategoryAndUserId(@Param("category") Category category, @Param("userId") String userId);

    List<TransactionEntity> findAllByUserIdAndCreatedAtAfter(String userId, Instant from);

    @Query("SELECT SUM(t.amount) FROM TransactionEntity t WHERE t.userId = :userId AND t.createdAt >= :from")
    Long sumAmountByUserIdAndCreatedAtAfter(@Param("userId") String userId, @Param("from") Instant from);

    void deleteByUserId(String userId);
}
