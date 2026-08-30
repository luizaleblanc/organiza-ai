package dio.budgeting.infrastructure.persistence.repository;

import dio.budgeting.infrastructure.persistence.entity.BudgetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BudgetEntityRepository extends JpaRepository<BudgetEntity, String> {
    Optional<BudgetEntity> findByUserIdAndMonthYear(String userId, String monthYear);
}
