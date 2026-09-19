package com.organiza.mod_user.controller;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_budget.service.BudgetModelMigrationService;
import com.organiza.mod_user.dto.UserSummaryResponse;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.mod_user.repository.UserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final UserEntityRepository userEntityRepository;
    private final BudgetModelMigrationService budgetModelMigrationService;

    public AdminController(UserRepository userRepository,
                          UserEntityRepository userEntityRepository,
                          BudgetModelMigrationService budgetModelMigrationService) {
        this.userRepository = userRepository;
        this.userEntityRepository = userEntityRepository;
        this.budgetModelMigrationService = budgetModelMigrationService;
    }

    @GetMapping("/users")
    @PreAuthorize("hasRole('ADMIN')")
    public List<UserSummaryResponse> listUsers() {
        return userRepository.findAll().stream().map(UserSummaryResponse::from).toList();
    }

    @PostMapping("/users/{id}/budget-model/migrate")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> migrateBudgetModel(@PathVariable String id) {
        UserEntity user = userEntityRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado: " + id));

        BudgetModelType previousModel = user.getBudgetModel();
        BudgetModelType nextModel = budgetModelMigrationService.migrateIfNeeded(user);

        if (previousModel != nextModel) {
            user.setBudgetModel(nextModel);
            userEntityRepository.save(user);
        }

        return Map.of(
                "userId", user.getId(),
                "previousModel", previousModel.name(),
                "currentModel", nextModel.name(),
                "migrated", previousModel != nextModel
        );
    }
}
