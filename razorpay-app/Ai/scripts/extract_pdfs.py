import json
import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]
PDF_DIR = Path(os.environ.get("PDF_DIR", REPO_ROOT / "edunex-b"))
OUT_DIR = Path(os.environ.get("TRANSCRIPTS", ROOT / "uploads" / "transcripts"))

PDFS = [
    {
        "file": "AI_Chat_Training_KnowledgeBase.pdf",
        "slug": "ai-influencer-chat-training",
        "title": "AI Chat Training Knowledge Base",
        "source_type": "chat_training",
    },
    {
        "file": "AI_Course_Notes_and_Prompts.pdf",
        "slug": "ai-influencer-notes-prompts",
        "title": "AI Course Notes and Prompts",
        "source_type": "notes_prompts",
    },
    {
        "file": "AI_Influencer_Course_Master_35lessons 2.pdf",
        "slug": "ai-influencer-master-script",
        "title": "AI Influencer Course Master Script",
        "source_type": "master_script",
    },
]


def clean_text(text):
    text = text.replace("\x0c", "\n\n")
    text = re.sub(r"([A-Za-z])-\n([A-Za-z])", r"\1\2", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def pdf_to_text(path):
    result = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return clean_text(result.stdout)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []

    for item in PDFS:
        pdf_path = PDF_DIR / item["file"]
        if not pdf_path.exists():
            raise SystemExit(f"Missing PDF: {pdf_path}")

        txt_path = OUT_DIR / f"{item['slug']}.txt"
        meta_path = OUT_DIR / f"{item['slug']}.txt.json"
        text = pdf_to_text(pdf_path)
        txt_path.write_text(text, encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "course_id": "ai-influencer",
                    "course_name": "ai influencer course",
                    "source_slug": item["slug"],
                    "document_title": item["title"],
                    "source_type": item["source_type"],
                    "source_pdf": str(pdf_path.relative_to(REPO_ROOT)),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        written.append((txt_path, len(text.split())))

    for path, words in written:
        print(f"{path}: {words} words")


if __name__ == "__main__":
    main()
