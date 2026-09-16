package com.organiza.mod_transaction.service;

import com.organiza.mod_transaction.repository.TransactionRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClearTransactionsUseCase {

    private final TransactionRepository transactionRepository;
    private final CurrentUserService currentUserService;

    public ClearTransactionsUseCase(TransactionRepository transactionRepository, CurrentUserService currentUserService) {
        this.transactionRepository = transactionRepository;
        this.currentUserService = currentUserService;
    }

    @Transactional
    public void execute() {
        String userId = currentUserService.getCurrentUserId();
        transactionRepository.deleteAllByUserId(userId);
    }
}
