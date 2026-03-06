#!/usr/bin/env python3

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

DEFAULT_PATH = Path(".agent/feature_list.json")
REQUIRED_KEYS = {
    "id",
    "priority",
    "category",
    "description",
    "steps",
    "passes",
    "evidence",
}
TASK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def load(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"feature list not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, list):
        raise SystemExit(f"feature list must be a JSON array: {path}")
    return data


def save(path: Path, data: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def sorted_failing(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    failing = [t for t in tasks if not t.get("passes", False)]
    failing.sort(key=lambda t: (int(t.get("priority", 9999)), str(t.get("id", ""))))
    return failing


def find_task(tasks: List[Dict[str, Any]], task_id: str) -> Dict[str, Any]:
    for task in tasks:
        if task.get("id") == task_id:
            return task
    raise SystemExit(f"task id not found: {task_id}")


def validate_tasks(tasks: List[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []
    seen_ids = set()

    for idx, task in enumerate(tasks, start=1):
        prefix = f"item #{idx}"

        if not isinstance(task, dict):
            errors.append(f"{prefix}: task must be an object")
            continue

        missing = REQUIRED_KEYS.difference(task.keys())
        if missing:
            errors.append(
                f"{prefix}: missing required keys: {', '.join(sorted(missing))}"
            )

        task_id = task.get("id")
        if not isinstance(task_id, str) or not task_id.strip():
            errors.append(f"{prefix}: id must be a non-empty string")
        else:
            if task_id in seen_ids:
                errors.append(f"{prefix}: duplicate id '{task_id}'")
            seen_ids.add(task_id)
            if not TASK_ID_RE.match(task_id):
                warnings.append(
                    f"{prefix}: id '{task_id}' should match {TASK_ID_RE.pattern} for stable automation"
                )

        priority = task.get("priority")
        if not isinstance(priority, int):
            errors.append(f"{prefix}: priority must be an integer")
        elif priority < 0:
            errors.append(f"{prefix}: priority must be >= 0")

        category = task.get("category")
        if not isinstance(category, str) or not category.strip():
            errors.append(f"{prefix}: category must be a non-empty string")

        description = task.get("description")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{prefix}: description must be a non-empty string")

        steps = task.get("steps")
        if not isinstance(steps, list) or not steps:
            errors.append(f"{prefix}: steps must be a non-empty array of strings")
        else:
            for step_idx, step in enumerate(steps, start=1):
                if not isinstance(step, str) or not step.strip():
                    errors.append(
                        f"{prefix}: steps[{step_idx}] must be a non-empty string"
                    )

        passes = task.get("passes")
        if not isinstance(passes, bool):
            errors.append(f"{prefix}: passes must be true/false")

        evidence = task.get("evidence")
        if evidence is not None and not isinstance(evidence, str):
            errors.append(f"{prefix}: evidence must be null or string")

    if not tasks:
        warnings.append("feature list is empty")

    return errors, warnings


def cmd_validate(args: argparse.Namespace) -> None:
    tasks = load(args.path)
    errors, warnings = validate_tasks(tasks)

    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")

    if errors:
        raise SystemExit(2)

    print(f"OK: {args.path} ({len(tasks)} tasks)")


def cmd_list(args: argparse.Namespace) -> None:
    tasks = load(args.path)
    errors, _warnings = validate_tasks(tasks)
    if errors and args.require_valid:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(2)

    failing = sorted_failing(tasks)
    for task in failing[: args.limit]:
        print(
            f"- {task.get('id')} (p{task.get('priority')}): {task.get('description')}"
        )

    if not failing:
        print("(no failing tasks)")


def cmd_show(args: argparse.Namespace) -> None:
    tasks = load(args.path)
    task = find_task(tasks, args.id)
    print(json.dumps(task, indent=2, ensure_ascii=False))


def cmd_next(args: argparse.Namespace) -> None:
    tasks = load(args.path)
    failing = sorted_failing(tasks)
    if not failing:
        print("")
        return
    print(failing[0].get("id", ""))


def cmd_set(args: argparse.Namespace, passes: bool) -> None:
    tasks = load(args.path)
    errors, _warnings = validate_tasks(tasks)
    if errors and args.require_valid:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(2)

    task = find_task(tasks, args.id)
    evidence = args.evidence

    if passes and evidence is None:
        if args.auto_evidence:
            evidence = (
                f"set by feature_list.py at {datetime.now(timezone.utc).isoformat()}"
            )
        else:
            raise SystemExit(
                "--evidence is required for `pass` unless --auto-evidence is set"
            )

    task["passes"] = passes
    if evidence is not None:
        task["evidence"] = evidence
    elif not passes and args.clear_evidence_on_fail:
        task["evidence"] = None

    save(args.path, tasks)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Utility for .agent/feature_list.json")
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH)

    sub = parser.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("validate", help="Validate schema and task integrity")
    sp.set_defaults(func=cmd_validate)

    sp = sub.add_parser("list", help="List failing tasks sorted by priority")
    sp.add_argument("--limit", type=int, default=20)
    sp.add_argument("--require-valid", action="store_true", default=False)
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("show", help="Show a task by id")
    sp.add_argument("id")
    sp.set_defaults(func=cmd_show)

    sp = sub.add_parser("next", help="Print id of next failing task")
    sp.set_defaults(func=cmd_next)

    sp = sub.add_parser("pass", help="Mark a task passing with evidence")
    sp.add_argument("id")
    sp.add_argument("--evidence", default=None)
    sp.add_argument("--auto-evidence", action="store_true", default=False)
    sp.add_argument("--require-valid", action="store_true", default=False)
    sp.add_argument("--clear-evidence-on-fail", action="store_true", default=False)
    sp.set_defaults(func=lambda args: cmd_set(args, True))

    sp = sub.add_parser("fail", help="Mark a task failing")
    sp.add_argument("id")
    sp.add_argument("--evidence", default=None)
    sp.add_argument("--auto-evidence", action="store_true", default=False)
    sp.add_argument("--require-valid", action="store_true", default=False)
    sp.add_argument("--clear-evidence-on-fail", action="store_true", default=False)
    sp.set_defaults(func=lambda args: cmd_set(args, False))

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
