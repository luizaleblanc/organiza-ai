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
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Compara, mes a mes (ultimos 3 meses), o percentual real gasto em cada
 * bucket do modelo de orcamento atual do usuario contra o percentual que o
 * modelo prevê -- e sugere um modelo diferente quando a divergencia (>15%)
 * se repete em pelo menos 2 dos 3 meses. Bucket real inferido da Category de
 * cada TransactionEntity via CategoryBucketMapper (o campo
 * TransactionEntity.bucket ainda nao e preenchido para todo o historico --
 * ver PROJECT_STATUS.md, "Campos/tabelas que FALTAM").
 */
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

        Map<YearMonth, BigDecimal> totalByMonth = new HashMap<>();
        Map<YearMonth, Map<Bucket, BigDecimal>> spentByBucketByMonth = new HashMap<>();
        for (TransactionEntity t : transactions) {
            if (t.getCreatedAt() == null) {
                continue;
            }
            YearMonth month = YearMonth.from(t.getCreatedAt().atZone(ZoneId.systemDefault()));
            BigDecimal amount = BigDecimal.valueOf(t.getAmount());
            totalByMonth.merge(month, amount, BigDecimal::add);

            Bucket bucket = CategoryBucketMapper.toBucket(currentModel, t.getCategory());
            spentByBucketByMonth.computeIfAbsent(month, m -> new HashMap<>()).merge(bucket, amount, BigDecimal::add);
        }

        if (totalByMonth.size() < MIN_MONTHS_WITH_DATA) {
            return new SuggestModelChangeOutput(false, null,
                    "Ainda não tenho dados suficientes dos últimos 3 meses para avaliar se vale a pena trocar de modelo.");
        }

        Map<Bucket, Integer> modelBucketPercentages = measurableBucketPercentages(currentModel);
        if (modelBucketPercentages.isEmpty()) {
            return new SuggestModelChangeOutput(false, null,
                    "Seu modelo atual não tem um percentual fixo de necessidades para comparar, então não há sugestão de troca por enquanto.");
        }

        Map<Bucket, Integer> divergentAboveByBucket = new HashMap<>();
        Map<Bucket, Integer> divergentBelowByBucket = new HashMap<>();
        for (Map.Entry<YearMonth, BigDecimal> monthTotal : totalByMonth.entrySet()) {
            BigDecimal total = monthTotal.getValue();
            if (total.compareTo(BigDecimal.ZERO) == 0) {
                continue;
            }
            Map<Bucket, BigDecimal> spentByBucket = spentByBucketByMonth.getOrDefault(monthTotal.getKey(), Map.of());
            for (Map.Entry<Bucket, Integer> modelBucket : modelBucketPercentages.entrySet()) {
                BigDecimal spent = spentByBucket.getOrDefault(modelBucket.getKey(), BigDecimal.ZERO);
                BigDecimal spentPercent = spent.multiply(BigDecimal.valueOf(100))
                        .divide(total, 2, RoundingMode.HALF_UP);
                BigDecimal divergence = spentPercent.subtract(BigDecimal.valueOf(modelBucket.getValue()));
                if (divergence.compareTo(DIVERGENCE_THRESHOLD) > 0) {
                    divergentAboveByBucket.merge(modelBucket.getKey(), 1, Integer::sum);
                } else if (divergence.negate().compareTo(DIVERGENCE_THRESHOLD) > 0) {
                    divergentBelowByBucket.merge(modelBucket.getKey(), 1, Integer::sum);
                }
            }
        }

        String otherBucketsInsight = describeOtherDivergentBuckets(currentModel, divergentAboveByBucket, divergentBelowByBucket);

        int needsAbove = divergentAboveByBucket.getOrDefault(Bucket.NEEDS, 0);
        if (needsAbove >= MIN_DIVERGENT_MONTHS) {
            BudgetModelType suggested = suggestModelForHigherNeeds(currentModel);
            if (suggested != null) {
                return new SuggestModelChangeOutput(true, suggested.name(),
                        "Nos últimos meses, suas necessidades essenciais consumiram bem mais do que o seu modelo atual prevê. Um modelo com mais espaço para necessidades, como o "
                                + suggested.name() + ", pode encaixar melhor." + otherBucketsInsight);
            }
        }

        int needsBelow = divergentBelowByBucket.getOrDefault(Bucket.NEEDS, 0);
        if (needsBelow >= MIN_DIVERGENT_MONTHS) {
            BudgetModelType suggested = suggestModelForLowerNeeds(currentModel);
            if (suggested != null) {
                return new SuggestModelChangeOutput(true, suggested.name(),
                        "Nos últimos meses, suas necessidades essenciais consumiram bem menos do que o seu modelo atual prevê. Um modelo como o "
                                + suggested.name() + " pode aproveitar melhor essa folga." + otherBucketsInsight);
            }
        }

        if (!otherBucketsInsight.isEmpty()) {
            return new SuggestModelChangeOutput(false, null,
                    "Seu modelo atual ainda parece adequado no geral, mas reparei uma coisa:" + otherBucketsInsight);
        }

        return new SuggestModelChangeOutput(false, null,
                "Seu modelo atual ainda parece adequado aos seus gastos dos últimos meses.");
    }

    /**
     * Percentuais dos buckets de cada modelo que sao de fato mensuraveis a
     * partir de Category (mesma base de BudgetModelPlanService.buildBuckets()).
     * Buckets de poupanca/reserva (SAVINGS) e quitacao de divida
     * (DEBT_PAYMENT) ficam de fora -- eles nunca sao alcancados a partir de
     * uma transacao (ver CategoryBucketMapper/Bucket), entao incluí-los
     * sempre pareceria "gasto zero", uma divergencia falsa. Modelos sem um
     * conjunto de buckets comparavel (SIMPLE_8020 mistura necessidades e
     * desejos em um unico bucket "Viver"; FREELANCER_BASE_ZERO nao tem
     * percentuais fixos) retornam vazio e ficam fora da comparacao.
     */
    private Map<Bucket, Integer> measurableBucketPercentages(BudgetModelType model) {
        return switch (model) {
            case STANDARD_503020 -> Map.of(Bucket.NEEDS, 50, Bucket.WANTS, 30);
            case SURVIVAL_702010 -> Map.of(Bucket.NEEDS, 70, Bucket.WANTS, 20);
            case ANTI_DEBT_701020 -> Map.of(Bucket.NEEDS, 70, Bucket.WANTS, 10);
            case KAKEIBO -> Map.of(Bucket.NEEDS, 50, Bucket.CULTURAL, 10, Bucket.LEISURE, 30, Bucket.EXTRAS, 10);
            case SIMPLE_8020, FREELANCER_BASE_ZERO -> Map.of();
        };
    }

    /**
     * Mensagem adicional sobre buckets alem de NEEDS que tambem divergiram --
     * so contexto, nao dispara sugestao de troca de modelo (a decisao de
     * troca continua ancorada em NEEDS, unico bucket presente em todos os
     * modelos comparaveis).
     */
    private String describeOtherDivergentBuckets(BudgetModelType model, Map<Bucket, Integer> above, Map<Bucket, Integer> below) {
        StringBuilder message = new StringBuilder();
        for (Bucket bucket : List.of(Bucket.WANTS, Bucket.CULTURAL, Bucket.LEISURE, Bucket.EXTRAS)) {
            String label = bucketLabel(bucket);
            if (label == null) {
                continue;
            }
            if (above.getOrDefault(bucket, 0) >= MIN_DIVERGENT_MONTHS) {
                message.append(" Seus gastos com ").append(label)
                        .append(" também estão bem acima do previsto pelo modelo ").append(model.name()).append(".");
            } else if (below.getOrDefault(bucket, 0) >= MIN_DIVERGENT_MONTHS) {
                message.append(" Você tem gastado bem menos que o previsto com ").append(label)
                        .append(" -- pode valer a pena realocar essa folga.");
            }
        }
        return message.toString();
    }

    private String bucketLabel(Bucket bucket) {
        return switch (bucket) {
            case WANTS -> "desejos";
            case CULTURAL -> "cultura";
            case LEISURE -> "lazer";
            case EXTRAS -> "extras";
            default -> null;
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
