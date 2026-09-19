package com.organiza.mod_transaction.repository;

import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.model.Transaction;
import com.organiza.mod_transaction.model.TransactionEntity;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class JpaTransactionRepository implements TransactionRepository {

    private final TransactionEntityRepository entityRepository;

    public JpaTransactionRepository(TransactionEntityRepository entityRepository) {
        this.entityRepository = entityRepository;
    }

    @Override
    public Transaction save(Transaction transaction) {
        TransactionEntity entity = TransactionEntity.from(transaction);
        entityRepository.save(entity);
        return transaction;
    }

    @Override
    public List<Transaction> findAllByCategoryAndUserId(Category category, String userId) {
        return entityRepository.findAllByCategoryAndUserId(category, userId)
                .stream()
                .map(TransactionEntity::toDomain)
                .toList();
    }

    @Override
    public Double sumAmountByCategoryAndUserId(Category category, String userId) {
        Double total = entityRepository.sumAmountByCategoryAndUserId(category, userId);
        return total != null ? total : 0.0;
    }

    @Override
    public void deleteAllByUserId(String userId) {
        entityRepository.deleteByUserId(userId);
    }
}
