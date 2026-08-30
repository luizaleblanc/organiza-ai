package dio.budgeting.infrastructure.persistence.repository;

import dio.budgeting.infrastructure.persistence.entity.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageEntityRepository extends JpaRepository<ChatMessageEntity, String> {
    List<ChatMessageEntity> findAllByUserIdOrderByCreatedAtAsc(String userId);
}
