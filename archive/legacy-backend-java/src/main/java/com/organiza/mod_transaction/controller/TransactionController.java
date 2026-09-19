package com.organiza.mod_transaction.controller;

import com.organiza.mod_transaction.dto.CategorySummary;
import com.organiza.mod_transaction.dto.DashboardSummaryResponse;
import com.organiza.mod_transaction.dto.TransactionRequest;
import com.organiza.mod_transaction.dto.TransactionResponse;
import com.organiza.mod_transaction.dto.TransactionOutput;
import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.service.ClearTransactionsUseCase;
import com.organiza.mod_transaction.service.GetTotalByCategoryUseCase;
import com.organiza.mod_transaction.service.ListTransactionsByCategoryUseCase;
import com.organiza.mod_transaction.service.PersistTransactionUseCase;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/transactions")
public class TransactionController {

    private final PersistTransactionUseCase persistTransactionUseCase;
    private final ListTransactionsByCategoryUseCase listTransactionsByCategoryUseCase;
    private final GetTotalByCategoryUseCase getTotalByCategoryUseCase;
    private final ClearTransactionsUseCase clearTransactionsUseCase;

    public TransactionController(PersistTransactionUseCase persistTransactionUseCase,
                                 ListTransactionsByCategoryUseCase listTransactionsByCategoryUseCase,
                                 GetTotalByCategoryUseCase getTotalByCategoryUseCase,
                                 ClearTransactionsUseCase clearTransactionsUseCase) {
        this.persistTransactionUseCase = persistTransactionUseCase;
        this.listTransactionsByCategoryUseCase = listTransactionsByCategoryUseCase;
        this.getTotalByCategoryUseCase = getTotalByCategoryUseCase;
        this.clearTransactionsUseCase = clearTransactionsUseCase;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionResponse createTransaction(@RequestBody TransactionRequest request) {
        var transaction = persistTransactionUseCase.execute(request.toInput());
        return TransactionResponse.from(transaction);
    }

    @GetMapping("/{category}")
    public List<TransactionResponse> readTransactions(@PathVariable Category category) {
        return listTransactionsByCategoryUseCase.execute(category).stream().map(TransactionResponse::from).toList();
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearTransactions() {
        clearTransactionsUseCase.execute();
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Double>> getDashboardSummary() {
        Map<String, Double> summary = new HashMap<>();

        for (Category category : Category.values()) {
            double total = listTransactionsByCategoryUseCase.execute(category).stream()
                    .mapToDouble(TransactionOutput::value)
                    .sum();

            if (total > 0) {
                summary.put(category.name(), total);
            }
        }
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardSummaryResponse> getDashboard() {
        List<CategorySummary> categorySummaries = new ArrayList<>();
        List<TransactionOutput> allTransactions = new ArrayList<>();
        double totalSpent = 0;
        String currency = "BRL";

        for (Category category : Category.values()) {
            List<TransactionOutput> outputs = listTransactionsByCategoryUseCase.execute(category);
            if (outputs.isEmpty()) {
                continue;
            }

            double categoryTotal = outputs.stream().mapToDouble(TransactionOutput::value).sum();
            totalSpent += categoryTotal;
            currency = outputs.get(0).currency();

            categorySummaries.add(new CategorySummary(category.name(), categoryTotal, currency, outputs.size(), 0));
            allTransactions.addAll(outputs);
        }

        double finalTotal = totalSpent;
        List<CategorySummary> withPercentages = categorySummaries.stream()
                .map(c -> new CategorySummary(c.category(), c.total(), c.currency(), c.count(),
                        finalTotal > 0 ? (c.total() / finalTotal) * 100 : 0))
                .toList();

        return ResponseEntity.ok(new DashboardSummaryResponse(totalSpent, currency, withPercentages, allTransactions));
    }
}
