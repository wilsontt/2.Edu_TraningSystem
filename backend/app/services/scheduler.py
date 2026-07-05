"""
APScheduler 整合（Wave 4；NAS PLAN §5.5）。

維持單一 `BackgroundScheduler` 行程內單例，依排程設定動態新增／更新／移除
唯一的備份 job；設定變更時由路由呼叫 `reschedule_backup_job()` 立即生效，
不需重啟後端。
"""

from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .. import models
from .backup_service import run_scheduled_backup

logger = logging.getLogger(__name__)

JOB_ID = "scheduled_backup"

_scheduler: Optional[BackgroundScheduler] = None


def _get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone="Asia/Taipei")
    return _scheduler


def start_scheduler() -> None:
    """應用啟動時呼叫：啟動排程器並依目前 DB 設定掛載備份 job。"""
    from ..database import SessionLocal
    from .backup_service import get_or_create_config

    scheduler = _get_scheduler()
    if not scheduler.running:
        scheduler.start()

    db = SessionLocal()
    try:
        config = get_or_create_config(db)
        reschedule_backup_job(config)
    finally:
        db.close()


def stop_scheduler() -> None:
    """應用關閉時呼叫：停止排程器。"""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)


def reschedule_backup_job(config: "models.BackupScheduleConfig") -> None:
    """依設定（enabled／frequency／time_of_day／weekday）新增、更新或移除排程 job。"""
    scheduler = _get_scheduler()
    if not scheduler.running:
        # 排程器尚未啟動（理論上不會發生於正常請求流程）；忽略，待 start_scheduler 重新讀取設定
        return

    existing = scheduler.get_job(JOB_ID)
    if not config.enabled:
        if existing:
            scheduler.remove_job(JOB_ID)
        return

    try:
        hour_str, minute_str = config.time_of_day.split(":")
        hour, minute = int(hour_str), int(minute_str)
    except (ValueError, AttributeError):
        logger.warning("排程備份 time_of_day 格式錯誤：%s，移除既有排程", config.time_of_day)
        if existing:
            scheduler.remove_job(JOB_ID)
        return

    if config.frequency == "weekly" and config.weekday is not None:
        trigger = CronTrigger(day_of_week=config.weekday, hour=hour, minute=minute)
    else:
        trigger = CronTrigger(hour=hour, minute=minute)

    scheduler.add_job(run_scheduled_backup, trigger=trigger, id=JOB_ID, replace_existing=True)
