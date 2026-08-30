package com.organiza.mod_transaction.service;

import com.organiza.mod_transaction.dto.GetTotalByCategoryInput;
import com.organiza.mod_transaction.dto.GetTotalByCategoryOutput;
import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.repository.TransactionRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.util.function.Function;

@Service
@Description("Calcula e retorna o valor total gasto em uma categoria especifica")
public class GetTotalByCategoryUseCase implements Function<GetTotalByCategoryInput, GetTotalByCategoryOutput> {

    private final TransactionRepository transactionRepository;
    private final CurrentUserService currentUserService;

    public GetTotalByCategoryUseCase(TransactionRepository transactionRepository, CurrentUserService currentUserService) {
        this.transactionRepository = transactionRepository;
        this.currentUserService = currentUserService;
    }

    @Override
    public GetTotalByCategoryOutput apply(GetTotalByCategoryInput input) {
        String userId = currentUserService.getCurrentUserId();
        Double total = transactionRepository.sumAmountByCategoryAndUserId(input.category(), userId);
        return new GetTotalByCategoryOutput(total);
    }

    public double execute(Category category) {
        String userId = currentUserService.getCurrentUserId();
        return transactionRepository.sumAmountByCategoryAndUserId(category, userId);
    }
}
