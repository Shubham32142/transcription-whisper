from __future__ import annotations

import argparse

from huggingface_hub import HfApi, upload_folder


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Push fine-tuned model to Hugging Face Hub")
  parser.add_argument("--model_path", required=True)
  parser.add_argument("--repo_name", required=True)
  parser.add_argument("--private", action="store_true")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  api = HfApi()

  api.create_repo(repo_id=args.repo_name, repo_type="model", exist_ok=True, private=args.private)
  upload_folder(folder_path=args.model_path, repo_id=args.repo_name, repo_type="model")
  print(f"Uploaded model from {args.model_path} to {args.repo_name}")


if __name__ == "__main__":
  main()
