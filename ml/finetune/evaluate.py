from __future__ import annotations

import argparse

import evaluate
from datasets import load_from_disk
from transformers import pipeline


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Evaluate Whisper WER/CER")
  parser.add_argument("--model_path", required=True)
  parser.add_argument("--dataset_path", required=True)
  return parser.parse_args()


def main() -> None:
  args = parse_args()

  dataset = load_from_disk(args.dataset_path)["test"]
  asr = pipeline("automatic-speech-recognition", model=args.model_path)

  predictions = []
  references = []

  for item in dataset:
    result = asr(item["audio"]["array"])
    predictions.append(result["text"])
    references.append(item["transcription"])

  wer = evaluate.load("wer").compute(predictions=predictions, references=references)
  cer = evaluate.load("cer").compute(predictions=predictions, references=references)

  print({"wer": wer, "cer": cer})


if __name__ == "__main__":
  main()
