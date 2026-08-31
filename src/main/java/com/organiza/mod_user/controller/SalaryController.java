package com.organiza.mod_user.controller;

import com.organiza.mod_user.dto.SalaryUpdateDTO;
import com.organiza.mod_user.dto.SalaryUpdateResponse;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class SalaryController {

    private final UserEntityRepository userEntityRepository;
    private final CurrentUserService currentUserService;

    public SalaryController(UserEntityRepository userEntityRepository, CurrentUserService currentUserService) {
        this.userEntityRepository = userEntityRepository;
        this.currentUserService = currentUserService;
    }

    @PatchMapping("/salary")
    public SalaryUpdateResponse updateSalary(@Valid @RequestBody SalaryUpdateDTO request) {
        UserEntity user = userEntityRepository.findById(currentUserService.getCurrentUserId()).orElseThrow();
        user.setSalary(request.salary());
        userEntityRepository.save(user);
        return SalaryUpdateResponse.from(user);
    }
}
