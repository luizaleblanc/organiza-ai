package com.organiza.mod_transaction.service;

import com.organiza.mod_transaction.dto.TransactionOutput;
import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.repository.TransactionRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.function.Function;

@Service
@Description("Busca e lista todas as transações financeiras filtradas por uma categoria específica")
public class ListTransactionsByCategoryUseCase implements Function<ListTransactionsByCategoryUseCase.Input, List<TransactionOutput>> {

    private final TransactionRepository transactionRepository;
    private final CurrentUserService currentUserService;

    public ListTransactionsByCategoryUseCase(TransactionRepository transactionRepository, CurrentUserService currentUserService) {
        this.transactionRepository = transactionRepository;
        this.currentUserService = currentUserService;
    }

    public record Input(Category category) {}

    public List<TransactionOutput> execute(Category category) {
        String userId = currentUserService.getCurrentUserId();
        return transactionRepository.findAllByCategoryAndUserId(category, userId).stream().map(TransactionOutput::from).toList();
    }

    @Override
    public List<TransactionOutput> apply(Input input) {
        return execute(input.category());
    }
}
