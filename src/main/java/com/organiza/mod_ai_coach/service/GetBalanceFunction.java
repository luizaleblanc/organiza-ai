package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.BucketBalanceDTO;
import com.organiza.mod_ai_coach.dto.GetBalanceInput;
import com.organiza.mod_ai_coach.dto.GetBalanceOutput;
import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_budget.service.BudgetModelPlanService;
import com.organiza.mod_transaction.model.Bucket;
import com.organiza.mod_transaction.model.TransactionEntity;
import com.organiza.mod_transaction.repository.TransactionEntityRepository;
import com.organiza.mod_user.dto.BucketSummaryDTO;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Resume quanto o usuario ja gastou em cada bucket do seu modelo de orcamento,
 * comparado ao limite planejado. Os limites vem de BudgetModelPlanService (mesma
 * fonte usada no onboarding); os gastos reais sao inferidos por CategoryBucketMapper,
 * ja que TransactionEntity.bucket ainda nao e preenchido para todo o historico.
 * <p>
 * Limitacao conhecida: buckets de poupanca/reserva ou quitacao de divida (ex:
 * "Quitação de Dívida" no ANTI_DEBT_701020) nunca aparecem com gasto real, pois
 * esses fluxos nao passam por TransactionEntity (ver VariableIncomeEntity).
 */
@Service
@Description("Retorna o resumo dos buckets do modelo de orcamento do usuario: limite planejado, quanto ja foi gasto e quanto resta em cada um")
public class GetBalanceFunction implements Function<GetBalanceInput, GetBalanceOutput> {

    private final UserEntityRepository userEntityRepository;
    private final TransactionEntityRepository transactionEntityRepository;
    private final CurrentUserService currentUserService;
    private final BudgetModelPlanService budgetModelPlanService;

    public GetBalanceFunction(UserEntityRepository userEntityRepository,
                               TransactionEntityRepository transactionEntityRepository,
                               CurrentUserService currentUserService,
                               BudgetModelPlanService budgetModelPlanService) {
        this.userEntityRepository = userEntityRepository;
        this.transactionEntityRepository = transactionEntityRepository;
        this.currentUserService = currentUserService;
        this.budgetModelPlanService = budgetModelPlanService;
    }

    @Override
    public GetBalanceOutput apply(GetBalanceInput input) {
        String userId = currentUserService.getCurrentUserId();
        UserEntity user = userEntityRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Usuário não encontrado."));

        BigDecimal salary = user.getSalary() != null ? user.getSalary() : BigDecimal.ZERO;
        BudgetModelType model = user.getBudgetModel();

        LocalDate firstDayOfMonth = LocalDate.now().withDayOfMonth(1);
        Instant from = firstDayOfMonth.atStartOfDay(ZoneId.systemDefault()).toInstant();
        List<TransactionEntity> monthTransactions = transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(userId, from);

        if (model == BudgetModelType.FREELANCER_BASE_ZERO) {
            BigDecimal totalSpent = sumAmounts(monthTransactions);
            BigDecimal notAllocated = salary.subtract(totalSpent);
            return new GetBalanceOutput(model.name(), List.of(), totalSpent, notAllocated);
        }

        List<BucketSummaryDTO> plan = budgetModelPlanService.buildBuckets(model, salary);
        Map<String, BigDecimal> spentByBucketName = model == BudgetModelType.KAKEIBO
                ? spentByKakeiboBucket(monthTransactions)
                : spentByStandardBucket(plan, monthTransactions);

        List<BucketBalanceDTO> buckets = plan.stream()
                .map(b -> {
                    BigDecimal spent = spentByBucketName.getOrDefault(b.name(), BigDecimal.ZERO);
                    return new BucketBalanceDTO(b.name(), b.percentage(), b.amount(), spent, b.amount().subtract(spent));
                })
                .toList();

        return new GetBalanceOutput(model.name(), buckets, null, null);
    }

    private BigDecimal sumAmounts(List<TransactionEntity> transactions) {
        return transactions.stream()
                .map(t -> BigDecimal.valueOf(t.getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<String, BigDecimal> spentByKakeiboBucket(List<TransactionEntity> transactions) {
        Map<String, BigDecimal> totals = new HashMap<>();
        for (TransactionEntity t : transactions) {
            String bucketName = CategoryBucketMapper.toKakeiboBucket(t.getCategory());
            totals.merge(bucketName, BigDecimal.valueOf(t.getAmount()), BigDecimal::add);
        }
        return totals;
    }

    /**
     * Mapeia o gasto real (NEEDS/WANTS/SAVINGS) para o nome do primeiro/segundo/terceiro
     * bucket do plano do modelo, na ordem em que BudgetModelPlanService.buildBuckets os
     * declara (ex: para STANDARD_503020, buckets[0]="Necessidades" recebe o gasto NEEDS).
     */
    private Map<String, BigDecimal> spentByStandardBucket(List<BucketSummaryDTO> plan, List<TransactionEntity> transactions) {
        BigDecimal needsSpent = BigDecimal.ZERO;
        BigDecimal wantsSpent = BigDecimal.ZERO;
        for (TransactionEntity t : transactions) {
            Bucket bucket = CategoryBucketMapper.toStandardBucket(t.getCategory());
            if (bucket == Bucket.NEEDS) {
                needsSpent = needsSpent.add(BigDecimal.valueOf(t.getAmount()));
            } else {
                wantsSpent = wantsSpent.add(BigDecimal.valueOf(t.getAmount()));
            }
        }

        Map<String, BigDecimal> totals = new HashMap<>();
        if (plan.size() == 2) {
            // SIMPLE_8020: um unico bucket "Viver" cobre necessidades + desejos
            totals.put(plan.get(0).name(), needsSpent.add(wantsSpent));
        } else if (plan.size() >= 2) {
            totals.put(plan.get(0).name(), needsSpent);
            totals.put(plan.get(1).name(), wantsSpent);
        }
        return totals;
    }
}
