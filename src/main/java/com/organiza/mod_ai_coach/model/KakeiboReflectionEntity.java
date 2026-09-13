package com.organiza.mod_ai_coach.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "kakeibo_reflections")
@Data
@AllArgsConstructor
@NoArgsConstructor
public class KakeiboReflectionEntity {

    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "kakeibo_reflection_answers",
            joinColumns = @JoinColumn(name = "reflection_id")
    )
    @Column(name = "answer", nullable = false)
    private List<String> answers = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public KakeiboReflectionEntity(String userId, LocalDate weekStart, List<String> answers) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.weekStart = weekStart;
        this.answers = new ArrayList<>(answers);
    }
}
