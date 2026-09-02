package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.SuggestModelChangeInput;
import com.organiza.mod_ai_coach.dto.SuggestModelChangeOutput;
import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_transaction.model.Bucket;
import com.organiza.mod_transaction.model.TransactionEntity;
import com.organiza.mod_transaction.repository.TransactionEntityRepository;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
@Description("Analisa os gastos dos ultimos 3 meses do usuario e verifica se o modelo de orcamento atual ainda faz sentido")
public class SuggestModelChangeFunction implements Function<SuggestModelChangeInput, SuggestModelChangeOutput> {

    private static final BigDecimal DIVERGENCE_THRESHOLD = BigDecimal.valueOf(15);
    private static final int MONTHS_LOOKBACK = 3;
    private static final int MIN_MONTHS_WITH_DATA = 2;
    private static final int MIN_DIVERGENT_MONTHS = 2;

    private final UserEntityRepository userEntityRepository;
    private final TransactionEntityRepository transactionEntityRepository;
    private final CurrentUserService currentUserService;

    public SuggestModelChangeFunction(UserEntityRepository userEntityRepository,
                                       TransactionEntityRepository transactionEntityRepository,
                                       CurrentUserService currentUserService) {
        this.userEntityRepository = userEntityRepository;
        this.transactionEntityRepository = transactionEntityRepository;
        this.currentUserService = currentUserService;
    }

    @Override
    public SuggestModelChangeOutput apply(SuggestModelChangeInput input) {
        String userId = currentUserService.getCurrentUserId();
        UserEntity user = userEntityRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Usuário não encontrado."));

        BudgetModelType currentModel = user.getBudgetModel();

        if (currentModel == BudgetModelType.ANTI_DEBT_701020 && !Boolean.TRUE.equals(user.getHasDebt())) {
            return new SuggestModelChangeOutput(true, BudgetModelType.STANDARD_503020.name(),
                    "Seu modelo atual é o Anti-Dívida, mas você não tem nenhuma dívida registrada. Faz mais sentido migrar para o modelo Padrão 50/30/20.");
        }

        LocalDate firstMonthStart = LocalDate.now().minusMonths(MONTHS_LOOKBACK - 1).withDayOfMonth(1);
        Instant from = firstMonthStart.atStartOfDay(ZoneId.systemDefault()).toInstant();
        var transactions = transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(userId, from);

        Map<YearMonth, BigDecimal[]> totalsByMonth = new HashMap<>(); // [needsSpent, totalSpent]
        for (TransactionEntity t : transactions) {
            if (t.getCreatedAt() == null) {
                continue;
            }
            YearMonth month = YearMonth.from(t.getCreatedAt().atZone(ZoneId.systemDefault()));
            BigDecimal[] totals = totalsByMonth.computeIfAbsent(month, m -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal amount = BigDecimal.valueOf(t.getAmount());
            totals[1] = totals[1].add(amount);
            if (CategoryBucketMapper.toStandardBucket(t.getCategory()) == Bucket.NEEDS) {
                totals[0] = totals[0].add(amount);
            }
        }

        if (totalsByMonth.size() < MIN_MONTHS_WITH_DATA) {
            return new SuggestModelChangeOutput(false, null,
                    "Ainda não tenho dados suficientes dos últimos 3 meses para avaliar se vale a pena trocar de modelo.");
        }

        Integer modelNeedsPercentage = needsPercentageForModel(currentModel);
        if (modelNeedsPercentage == null) {
            return new SuggestModelChangeOutput(false, null,
                    "Seu modelo atual não tem um percentual fixo de necessidades para comparar, então não há sugestão de troca por enquanto.");
        }

        int divergentAbove = 0;
        int divergentBelow = 0;
        for (BigDecimal[] totals : totalsByMonth.values()) {
            if (totals[1].compareTo(BigDecimal.ZERO) == 0) {
                continue;
            }
            BigDecimal needsPercent = totals[0].multiply(BigDecimal.valueOf(100))
                    .divide(totals[1], 2, RoundingMode.HALF_UP);
            BigDecimal divergence = needsPercent.subtract(BigDecimal.valueOf(modelNeedsPercentage));
            if (divergence.compareTo(DIVERGENCE_THRESHOLD) > 0) {
                divergentAbove++;
            } else if (divergence.negate().compareTo(DIVERGENCE_THRESHOLD) > 0) {
                divergentBelow++;
            }
        }

        if (divergentAbove >= MIN_DIVERGENT_MONTHS) {
            BudgetModelType suggested = suggestModelForHigherNeeds(currentModel);
            if (suggested != null) {
                return new SuggestModelChangeOutput(true, suggested.name(),
                        "Nos últimos meses, suas necessidades essenciais consumiram bem mais do que o seu modelo atual prevê. Um modelo com mais espaço para necessidades, como o "
                                + suggested.name() + ", pode encaixar melhor.");
            }
        }

        if (divergentBelow >= MIN_DIVERGENT_MONTHS) {
            BudgetModelType suggested = suggestModelForLowerNeeds(currentModel);
            if (suggested != null) {
                return new SuggestModelChangeOutput(true, suggested.name(),
                        "Nos últimos meses, suas necessidades essenciais consumiram bem menos do que o seu modelo atual prevê. Um modelo como o "
                                + suggested.name() + " pode aproveitar melhor essa folga.");
            }
        }

        return new SuggestModelChangeOutput(false, null,
                "Seu modelo atual ainda parece adequado aos seus gastos dos últimos meses.");
    }

    /**
     * Percentual de necessidades de cada modelo, na mesma base de
     * BudgetModelPlanService.buildBuckets(). Modelos sem um bucket de
     * "necessidades" comparavel (SIMPLE_8020 mistura necessidades e desejos
     * em um unico bucket "Viver"; FREELANCER_BASE_ZERO nao tem percentuais
     * fixos) retornam null e ficam fora da comparacao de divergencia.
     */
    private Integer needsPercentageForModel(BudgetModelType model) {
        return switch (model) {
            case STANDARD_503020 -> 50;
            case SURVIVAL_702010 -> 70;
            case ANTI_DEBT_701020 -> 70;
            case KAKEIBO -> 50;
            case SIMPLE_8020, FREELANCER_BASE_ZERO -> null;
        };
    }

    private BudgetModelType suggestModelForHigherNeeds(BudgetModelType current) {
        return switch (current) {
            case STANDARD_503020 -> BudgetModelType.SURVIVAL_702010;
            case ANTI_DEBT_701020 -> BudgetModelType.SURVIVAL_702010;
            case KAKEIBO -> BudgetModelType.SURVIVAL_702010;
            default -> null;
        };
    }

    private BudgetModelType suggestModelForLowerNeeds(BudgetModelType current) {
        return switch (current) {
            case SURVIVAL_702010 -> BudgetModelType.STANDARD_503020;
            case KAKEIBO -> BudgetModelType.STANDARD_503020;
            default -> null;
        };
    }
}
