from __future__ import annotations

import argparse
from pathlib import Path

from datasets import Audio, Dataset, DatasetDict


def build_split(split_dir: Path) -> Dataset:
  metadata = split_dir / "metadata.csv"
  audio_dir = split_dir / "audio"

  if not metadata.exists() or not audio_dir.exists():
    raise FileNotFoundError(f"Missing metadata.csv or audio directory in {split_dir}")

  dataset = Dataset.from_csv(str(metadata))

  def add_audio_path(example: dict) -> dict:
    example["audio"] = str(audio_dir / example["file_name"])
    return example

  dataset = dataset.map(add_audio_path)
  dataset = dataset.cast_column("audio", Audio(sampling_rate=16_000))
  return dataset


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Prepare whisper finetuning dataset")
  parser.add_argument("--data_dir", required=True, help="Dataset root directory")
  parser.add_argument("--output_dir", required=True, help="Path to save processed dataset")
  parser.add_argument("--model_name", default="openai/whisper-small")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  data_dir = Path(args.data_dir)

  dataset = DatasetDict(
    {
      "train": build_split(data_dir / "train"),
      "test": build_split(data_dir / "test"),
    }
  )

  dataset.save_to_disk(args.output_dir)
  print(f"Saved processed dataset to {args.output_dir} for model {args.model_name}")


if __name__ == "__main__":
  main()
