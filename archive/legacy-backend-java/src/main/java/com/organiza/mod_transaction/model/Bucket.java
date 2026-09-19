package com.organiza.mod_transaction.model;

/**
 * Buckets dos 6 modelos de orcamento adaptativos (ver BudgetModelPlanService).
 * NEEDS/WANTS/SAVINGS cobrem STANDARD_503020, SURVIVAL_702010 e o essencial/
 * desejos de ANTI_DEBT_701020 e SIMPLE_8020. DEBT_PAYMENT (Quitacao de Divida,
 * ANTI_DEBT_701020) e CULTURAL/LEISURE/EXTRAS (Kakeibo) cobrem os buckets que
 * nao mapeiam para essa tríade.
 * <p>
 * Limitacao conhecida (ver CategoryBucketMapper): nenhuma Category representa
 * poupanca/reserva ou quitacao de divida -- esses fluxos passam por
 * VariableIncomeEntity, nao por TransactionEntity. Por isso SAVINGS e
 * DEBT_PAYMENT nunca sao alcancados a partir de uma transacao, e ficam de
 * fora da analise de divergencia em SuggestModelChangeFunction.
 */
public enum Bucket {
    NEEDS,
    WANTS,
    SAVINGS,
    DEBT_PAYMENT,
    CULTURAL,
    LEISURE,
    EXTRAS
}
