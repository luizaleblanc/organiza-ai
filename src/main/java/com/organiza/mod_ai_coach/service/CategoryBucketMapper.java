package com.organiza.mod_ai_coach.service;

import com.organiza.mod_transaction.model.Bucket;
import com.organiza.mod_transaction.model.Category;

import java.util.Set;

/**
 * Infere o bucket de uma transacao a partir da sua categoria, para uso em
 * getBalance() e suggestModelChange(). Necessario porque TransactionEntity.bucket
 * e um campo novo, nullable, ainda nao preenchido para dados legados
 * (ver PROJECT_STATUS.md, "Campos/tabelas que FALTAM").
 * <p>
 * Limitacao conhecida: nenhuma Category representa poupanca/reserva ou quitacao
 * de divida (esses fluxos passam por VariableIncomeEntity, nao por TransactionEntity),
 * entao o bucket SAVINGS nunca e alcancado a partir de uma transacao.
 */
final class CategoryBucketMapper {

    private static final Set<Category> NEEDS = Set.of(
            Category.GROCERIES, Category.PHARMA, Category.HEALTH,
            Category.TRANSPORT, Category.HOUSING, Category.EDUCATION);

    private CategoryBucketMapper() {
    }

    static Bucket toStandardBucket(Category category) {
        return NEEDS.contains(category) ? Bucket.NEEDS : Bucket.WANTS;
    }

    /**
     * Mapeamento heuristico para o modelo KAKEIBO, cujos 4 buckets (Essencial,
     * Cultura, Lazer, Extras) nao correspondem ao enum Bucket (NEEDS/WANTS/SAVINGS).
     */
    static String toKakeiboBucket(Category category) {
        return switch (category) {
            case GROCERIES, PHARMA, HEALTH, TRANSPORT, HOUSING, EDUCATION -> "Essencial";
            case SUBSCRIPTIONS -> "Cultura";
            case LEISURE, FOOD -> "Lazer";
            case AUTO, SHOPPING, OTHER -> "Extras";
        };
    }
}
