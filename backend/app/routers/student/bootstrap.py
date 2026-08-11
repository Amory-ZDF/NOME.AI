"""Bootstrap router — GET /api/student/bootstrap.

One-shot load of the entire student shell state. Called once on app mount.
Returns every domain object the frontend needs: student profile, tasks,
exercise sets, error book, notes, settings, and home-page widgets.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.models.domain import (
    ApiResponse,
    BootstrapData,
    Greeting,
    LearningSummary,
    ModuleStats,
    Settings,
    Student,
    Task,
    TaskTypeEnum,
    TaskPriorityEnum,
    TaskStatusEnum,
)

router = APIRouter(tags=["bootstrap"])


@router.get("/student/bootstrap", response_model=ApiResponse)
async def bootstrap():
    """Return the full student shell state.

    In production this aggregates multiple backend services (task service,
    error service, note service, profile service, etc.) into one payload.
    Currently returns a minimal valid seed — the frontend builds its own
    seed data in mock mode, so real data is expected to come from a
    persistent database in future iterations.
    """
    now = datetime.now(timezone.utc).isoformat()

    data = BootstrapData(
        student=Student(
            id="default",
            name="Student",
            joined_days=30,
            grade_info="A-Level · Year 12 Science",
        ),
        tasks=[
            Task(
                id="task-seed-1",
                title="A-Level Physics — Kinematics",
                type=TaskTypeEnum.TEACHER_ASSIGNED,
                subject="A-Level Physics",
                estimated_minutes=30,
                priority=TaskPriorityEnum.P1,
                is_overdue=False,
                status=TaskStatusEnum.PENDING,
                topic_ids=["kin-01"],
                created_at=now,
            ),
        ],
        settings=Settings(),
        greeting=Greeting(
            message="Welcome to NOME.AI! Ready to study?",
            fallback="Good to see you!",
        ),
        module_stats=ModuleStats(
            notes_count=0,
            weekly_exercises=0,
            latest_accuracy=0,
            pending_error_review=0,
        ),
        learning_summary=LearningSummary(
            overall_mastery=0,
            weekly_completed=0,
            weekly_total=5,
            overdue_tasks=0,
            weak_topics=[],
            knowledge_heatmap=[],
        ),
    )

    return ApiResponse(data=data.model_dump(by_alias=True, exclude_none=True))
