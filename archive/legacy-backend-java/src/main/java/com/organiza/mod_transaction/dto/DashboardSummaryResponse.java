package com.organiza.mod_transaction.dto;

import java.util.List;

public record DashboardSummaryResponse(
        double totalSpent,
        String currency,
        List<CategorySummary> categories,
        List<TransactionOutput> transactions
) {
}
