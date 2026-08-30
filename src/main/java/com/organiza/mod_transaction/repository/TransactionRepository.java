package com.organiza.mod_transaction.repository;

import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.model.Transaction;

import java.util.List;

public interface TransactionRepository {
    Transaction save(Transaction transaction);

    List<Transaction> findAllByCategoryAndUserId(Category category, String userId);

    Double sumAmountByCategoryAndUserId(Category category, String userId);

    void deleteAllByUserId(String userId);
}
