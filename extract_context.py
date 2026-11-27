import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

# ================= 默认配置区（可直接修改或通过命令行参数覆盖） =================
PROJECT_ROOT = Path(r"D:\Desktop\我的项目\AI_Transfer")
OUTPUT_DIR = PROJECT_ROOT / "输出"

# 本次任务默认需要提取的核心文件（支持相对路径，也支持直接写目录路径）
DEFAULT_TARGETS = [
    "package.json",
    "src/types/note.ts",
    "src/utils/api.ts",
    "src/store/useAuthStore.ts",
    "src/store/useNoteStore.ts",
    "src/store/useFileStore.ts",
    "src/components/layout/Sidebar.tsx",
    "src/components/notes/RichTextNoteEditor.tsx",
    "src/components/notes/RichNoteExtensions.tsx",
    "src/pages/Notes/index.tsx",
    "src/pages/FileCenter/index.tsx",
    "src/pages/UserManagement/index.tsx",
]

# 遍历目录时允许提取的文本/代码后缀
ALLOWED_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".py", ".sql", ".md", ".yaml", ".yml"
}

# 遍历目录时自动忽略的目录名
IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__", "venv", ".venv", "输出", ".idea", ".vscode"
}
# ==============================================================================


def collect_files(root: Path, targets: list[str]) -> list[Path]:
    collected = []
    seen = set()

    for raw_target in targets:
        target_path = Path(raw_target)
        if not target_path.is_absolute():
            target_path = (root / target_path).resolve()

        if not target_path.exists():
            print(f"[警告] 路径不存在，已跳过: {raw_target}")
            continue

        if target_path.is_file():
            if target_path not in seen:
                seen.add(target_path)
                collected.append(target_path)
        elif target_path.is_dir():
            for dirpath, dirnames, filenames in os.walk(target_path):
                dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
                for fname in sorted(filenames):
                    fpath = Path(dirpath) / fname
                    if fpath.suffix.lower() in ALLOWED_EXTS and fpath not in seen:
                        seen.add(fpath)
                        collected.append(fpath)

    return collected


def export_merged_context(root: Path, targets: list[str], output_dir: Path, tag: str = "context") -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    files = collect_files(root, targets)

    if not files:
        raise RuntimeError("未匹配到任何有效文件，请检查路径配置。")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = output_dir / f"{tag}_{timestamp}.txt"

    lines = []
    lines.append("=" * 80)
    lines.append(f"PROJECT ROOT : {root}")
    lines.append(f"EXPORT TIME  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"FILE COUNT   : {len(files)}")
    lines.append("=" * 80)
    lines.append("\n[FILE INDEX]")
    for idx, f in enumerate(files, 1):
        rel = f.relative_to(root) if f.is_relative_to(root) else f
        lines.append(f"{idx:02d}. {rel.as_posix()} ({f.stat().st_size} bytes)")
    lines.append("\n" + "=" * 80 + "\n")

    for idx, f in enumerate(files, 1):
        rel = f.relative_to(root) if f.is_relative_to(root) else f
        rel_str = rel.as_posix()
        lines.append(f"### >>> FILE START [{idx:02d}/{len(files)}]: {rel_str} <<< ###")
        lines.append(f"``` {f.suffix.lstrip('.') or 'text'}")
        try:
            content = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = f.read_text(encoding="gbk", errors="replace")
        lines.append(content.rstrip())
        lines.append("```")
        lines.append(f"### <<< FILE END: {rel_str} >>> ###\n")

    out_file.write_text("\n".join(lines), encoding="utf-8")
    return out_file


def main():
    parser = argparse.ArgumentParser(description="提取并合并项目源码供 AI 上下文读取")
    parser.add_argument(
        "targets",
        nargs="*",
        help="要提取的文件或目录相对路径（留空则使用脚本内 DEFAULT_TARGETS）"
    )
    parser.add_argument(
        "-t", "--tag",
        default="ai_context",
        help="输出文件名前缀标签（默认: ai_context）"
    )
    parser.add_argument(
        "-r", "--root",
        default=str(PROJECT_ROOT),
        help="项目根目录路径"
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    targets = args.targets if args.targets else DEFAULT_TARGETS
    out_path = export_merged_context(root, targets, root / "输出", tag=args.tag)
    print(f"[成功] 已合并 {len(targets)} 个目标项 -> {out_path}")


if __name__ == "__main__":
    main()