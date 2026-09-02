#!/usr/bin/env python3
"""
coding-benchmark 하네스 최소 재구성 (Windows / git-bash 호환, claude CLI 전용).

원본 `~/.claude/skills/coding-benchmark/scripts/run_benchmark.py` 는 이 PC에 없어
bench.json 의미론을 그대로 따라 다시 썼다:
  - contestant 마다 빈 실행 디렉토리에서 `claude -p` 를 PROMPT.md 로 실행
  - 격리: --safe-mode, effort: --effort <level>
  - verify.setup → verify.checks 실행, critical 실패 시 --resume 으로 재시도 (max_attempts)
  - 실패한 검증 출력이 다음 시도 프롬프트로 전달
  - wall_sec = 모든 시도의 프로세스 벽시계 합계
  - 토큰/비용/턴 = CLI 결과 JSON (usage, total_cost_usd, num_turns) 시도별 합산

사용:
  python harness/run_benchmark.py --config bench.json --contestant claude-fable51-high
  python harness/run_benchmark.py --config bench.json --contestant claude-fable51-high --dry
"""
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def dump_json(obj, p):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def log(run_dir, msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(run_dir / "harness.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---------- verify ----------
GIT_BASH = (
    next(
        (p for p in [r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"] if os.path.exists(p)),
        "bash",
    )
    if os.name == "nt"
    else "bash"
)


def run_bash(cmd, cwd, timeout):
    """검증 명령은 git-bash 로 실행. System32 의 bash.exe 는 WSL 이라 다른 node(v18) 가 잡힌다."""
    t0 = time.time()
    try:
        r = subprocess.run(
            [GIT_BASH, "-c", cmd],
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return {
            "rc": r.returncode,
            "stdout": (r.stdout or "")[-6000:],
            "stderr": (r.stderr or "")[-6000:],
            "sec": round(time.time() - t0, 1),
            "timeout": False,
        }
    except subprocess.TimeoutExpired as e:
        out = e.stdout if isinstance(e.stdout, str) else (e.stdout or b"").decode("utf-8", "replace")
        err = e.stderr if isinstance(e.stderr, str) else (e.stderr or b"").decode("utf-8", "replace")
        return {"rc": -1, "stdout": out[-6000:], "stderr": err[-6000:], "sec": round(time.time() - t0, 1), "timeout": True}


def verify(cfg, cwd, run_dir):
    v = cfg["verify"]
    result = {"setup": [], "checks": [], "passed": 0, "total": 0, "critical_failed": []}
    for cmd in v.get("setup", []):
        log(run_dir, f"verify setup: {cmd}")
        r = run_bash(cmd, cwd, v.get("setup_timeout", 900))
        result["setup"].append({"cmd": cmd, **r})
    for chk in v["checks"]:
        r = run_bash(chk["cmd"], cwd, chk.get("timeout", 60))
        ok = r["rc"] == 0
        entry = {"name": chk["name"], "cmd": chk["cmd"], "critical": chk.get("critical", False), "ok": ok, **r}
        result["checks"].append(entry)
        result["total"] += 1
        if ok:
            result["passed"] += 1
        elif chk.get("critical", False):
            result["critical_failed"].append(chk["name"])
        log(run_dir, f"check {chk['name']}: {'PASS' if ok else 'FAIL'} ({r['sec']}s)")
    return result


# ---------- claude ----------
def run_claude(prompt, cwd, contestant, timeout, resume=None):
    exe = shutil.which("claude")
    if not exe:
        raise RuntimeError("claude CLI not found in PATH")
    args = [
        exe,
        "-p",
        "--model",
        contestant["model"],
        "--effort",
        contestant.get("effort", "high"),
        "--safe-mode",
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
    ]
    if resume:
        args += ["--resume", resume]
    env = os.environ.copy()
    for k in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"):
        env.pop(k, None)
    t0 = time.time()
    timed_out = False
    try:
        r = subprocess.run(
            args,
            cwd=cwd,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
            shell=(os.name == "nt"),
        )
        stdout, stderr, rc = r.stdout or "", r.stderr or "", r.returncode
    except subprocess.TimeoutExpired as e:
        timed_out = True
        stdout = e.stdout if isinstance(e.stdout, str) else (e.stdout or b"").decode("utf-8", "replace")
        stderr = e.stderr if isinstance(e.stderr, str) else (e.stderr or b"").decode("utf-8", "replace")
        rc = -1
    wall = time.time() - t0

    data = None
    s = stdout.strip()
    if s:
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            for line in reversed(s.splitlines()):
                line = line.strip()
                if line.startswith("{"):
                    try:
                        data = json.loads(line)
                        break
                    except json.JSONDecodeError:
                        continue
    usage = (data or {}).get("usage", {}) or {}
    return {
        "wall_sec": round(wall, 1),
        "rc": rc,
        "timed_out": timed_out,
        "session_id": (data or {}).get("session_id"),
        "duration_ms": (data or {}).get("duration_ms"),
        "duration_api_ms": (data or {}).get("duration_api_ms"),
        "num_turns": (data or {}).get("num_turns", 0) or 0,
        "is_error": (data or {}).get("is_error", data is None),
        "subtype": (data or {}).get("subtype"),
        "stop_reason": (data or {}).get("stop_reason"),
        "api_error_status": (data or {}).get("api_error_status"),
        "total_cost_usd": (data or {}).get("total_cost_usd", 0.0) or 0.0,
        "usage": {
            "input_tokens": usage.get("input_tokens", 0) or 0,
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0) or 0,
            "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0) or 0,
            "output_tokens": usage.get("output_tokens", 0) or 0,
        },
        "model_usage": (data or {}).get("modelUsage"),
        "result_tail": ((data or {}).get("result") or "")[-2000:],
        "stderr_tail": stderr[-3000:],
        "raw_stdout_tail": "" if data else stdout[-3000:],
    }


def count_loc(cwd):
    exts = {".js", ".mjs", ".ts", ".css", ".html", ".glsl", ".vert", ".frag", ".json"}
    skip_dirs = {"node_modules", "dist", "public", ".git", ".vercel"}
    skip_files = {"package-lock.json"}
    total = 0
    files = 0
    for root, dirs, fs in os.walk(cwd):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for fn in fs:
            if fn in skip_files or Path(fn).suffix not in exts:
                continue
            try:
                with open(Path(root) / fn, encoding="utf-8", errors="replace") as f:
                    total += sum(1 for _ in f)
                files += 1
            except OSError:
                pass
    return {"lines": total, "files": files, "rule": "src/scripts/index.html 등 .js/.css/.html/.json (package-lock, public, dist, node_modules 제외)"}


def tool_version(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60, shell=True)
        return (r.stdout or r.stderr).strip().splitlines()[0]
    except Exception as e:  # noqa: BLE001
        return f"n/a ({e})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--contestant", required=True, help="bench.json contestants[].id")
    ap.add_argument("--dry", action="store_true", help="사소한 프롬프트로 파이프라인만 검증")
    ap.add_argument("--run-root", default=None)
    args = ap.parse_args()

    cfg_path = Path(args.config).resolve()
    cfg = load_json(cfg_path)
    base = cfg_path.parent
    contestant = next((c for c in cfg["contestants"] if c["id"] == args.contestant), None)
    if not contestant:
        sys.exit(f"contestant {args.contestant} not in config")

    run_root = Path(args.run_root) if args.run_root else base / cfg["run_root"]
    run_dir = run_root / contestant["id"]
    work = run_dir / "work"
    if args.dry:
        run_dir = run_root / (contestant["id"] + "-dry")
        work = run_dir / "work"
        if work.exists():
            shutil.rmtree(work)
    if work.exists() and any(work.iterdir()):
        sys.exit(f"work dir not empty: {work}")
    work.mkdir(parents=True, exist_ok=True)

    prompt = (base / cfg["prompt_file"]).read_text(encoding="utf-8")
    if args.dry:
        prompt = "현재 디렉토리에 hello.txt 파일을 만들고 내용으로 'hi' 를 쓰세요. 다른 것은 하지 마세요."
    max_attempts = 1 if args.dry else cfg.get("max_attempts", 1)
    timeout = cfg.get("timeout_sec", 3600)

    summary = {
        "task_id": cfg["task_id"],
        "contestant": contestant,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "env": {
            "os": platform.platform(),
            "python": platform.python_version(),
            "claude_cli": tool_version("claude --version"),
            "node": tool_version("node -v"),
            "verify_shell": GIT_BASH,
            "npm": tool_version("npm -v"),
            "isolation": "--safe-mode",
            "flags": "-p --effort {effort} --safe-mode --dangerously-skip-permissions --output-format json".format(**contestant),
        },
        "dry": args.dry,
    }
    dump_json(summary, run_dir / "summary.json")
    log(run_dir, f"start contestant={contestant['id']} model={contestant['model']} work={work}")

    attempts = []
    session = None
    t_start = time.time()
    verify_result = None
    for attempt in range(1, max_attempts + 1):
        log(run_dir, f"attempt {attempt}/{max_attempts} (resume={session})")
        res = run_claude(prompt, work, contestant, timeout, resume=session)
        res["attempt"] = attempt
        session = res.get("session_id") or session
        log(run_dir, f"claude done: wall={res['wall_sec']}s turns={res['num_turns']} cost=${res['total_cost_usd']:.2f} error={res['is_error']} rc={res['rc']}")
        limit_hit = res.get("api_error_status") == 429 or "spend limit" in res["result_tail"] or "usage limit" in res["result_tail"].lower()
        res["limit_hit"] = limit_hit
        verify_result = verify(cfg, work, run_dir)
        res["verify"] = {"passed": verify_result["passed"], "total": verify_result["total"], "critical_failed": verify_result["critical_failed"]}
        attempts.append(res)
        dump_json({"attempts": attempts}, run_dir / "metrics.json")
        dump_json(verify_result, run_dir / f"verify.attempt{attempt}.json")
        if not verify_result["critical_failed"] and not res["is_error"]:
            break
        if not verify_result["critical_failed"] and res["is_error"]:
            # 검증은 통과했지만 CLI 가 에러로 끝남 → 완료로 간주
            break
        if limit_hit:
            log(run_dir, "ABORT: 사용량 한도(429) 도달 — 재시도해도 소진만 되므로 중단. 한도 해제 후 다시 실행할 것.")
            summary["aborted_reason"] = "usage_limit_429"
            break
        failed = [c for c in verify_result["checks"] if not c["ok"] and c["critical"]]
        prompt = (
            "이전 시도의 자동 검증이 실패했습니다. 아래 실패한 검증 명령의 출력을 보고 문제를 고치세요.\n"
            "완료 조건: npm run build 와 npm run selftest 가 성공해야 합니다.\n\n"
            + "\n\n".join(
                f"### {c['name']}\n$ {c['cmd']}\n(exit {c['rc']}{', timeout' if c['timeout'] else ''})\n--- stdout ---\n{c['stdout']}\n--- stderr ---\n{c['stderr']}"
                for c in failed
            )
        )

    tot = {
        "wall_sec": round(sum(a["wall_sec"] for a in attempts), 1),
        "wall_min": round(sum(a["wall_sec"] for a in attempts) / 60, 1),
        "attempts": len(attempts),
        "turns": sum(a["num_turns"] for a in attempts),
        "input_tokens": sum(a["usage"]["input_tokens"] for a in attempts),
        "cache_creation_input_tokens": sum(a["usage"]["cache_creation_input_tokens"] for a in attempts),
        "cache_read_input_tokens": sum(a["usage"]["cache_read_input_tokens"] for a in attempts),
        "output_tokens": sum(a["usage"]["output_tokens"] for a in attempts),
        "cost_usd": round(sum(a["total_cost_usd"] for a in attempts), 4),
    }
    tot["noncache_tokens"] = tot["input_tokens"] + tot["cache_creation_input_tokens"] + tot["output_tokens"]
    tot["total_tokens"] = tot["noncache_tokens"] + tot["cache_read_input_tokens"]
    tot["noncache_ratio"] = round(tot["noncache_tokens"] / tot["total_tokens"], 4) if tot["total_tokens"] else None
    summary.update(
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "harness_wall_sec": round(time.time() - t_start, 1),
            "totals": tot,
            "verify": {"passed": verify_result["passed"], "total": verify_result["total"], "critical_failed": verify_result["critical_failed"]},
            "completed": not verify_result["critical_failed"],
            "loc": count_loc(work),
            "session_id": session,
        }
    )
    dump_json(summary, run_dir / "summary.json")
    dump_json(verify_result, run_dir / "verify.json")
    dump_json({"attempts": attempts, "totals": tot}, run_dir / "metrics.json")
    log(run_dir, f"DONE completed={summary['completed']} verify={verify_result['passed']}/{verify_result['total']} wall={tot['wall_min']}min turns={tot['turns']} cost=${tot['cost_usd']}")


if __name__ == "__main__":
    main()
