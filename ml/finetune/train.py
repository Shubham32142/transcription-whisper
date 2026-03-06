from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any

from datasets import load_from_disk
from transformers import (
  Seq2SeqTrainer,
  Seq2SeqTrainingArguments,
  WhisperFeatureExtractor,
  WhisperForConditionalGeneration,
  WhisperProcessor,
  WhisperTokenizer,
)


@dataclass
class DataCollatorSpeechSeq2Seq:
  processor: WhisperProcessor

  def __call__(self, features: list[dict[str, Any]]) -> dict[str, Any]:
    input_features = [{"input_features": f["input_features"]} for f in features]
    label_features = [{"input_ids": f["labels"]} for f in features]

    batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
    labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")

    labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
    batch["labels"] = labels
    return batch


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Fine-tune Whisper model")
  parser.add_argument("--model_name", required=True)
  parser.add_argument("--dataset_path", required=True)
  parser.add_argument("--output_dir", required=True)
  parser.add_argument("--num_epochs", type=int, default=10)
  parser.add_argument("--batch_size", type=int, default=8)
  parser.add_argument("--learning_rate", type=float, default=1e-5)
  parser.add_argument("--language", default="Hindi")
  parser.add_argument("--task", default="transcribe")
  return parser.parse_args()


def main() -> None:
  args = parse_args()

  dataset = load_from_disk(args.dataset_path)
  feature_extractor = WhisperFeatureExtractor.from_pretrained(args.model_name)
  tokenizer = WhisperTokenizer.from_pretrained(args.model_name, language=args.language, task=args.task)
  processor = WhisperProcessor(feature_extractor=feature_extractor, tokenizer=tokenizer)

  model = WhisperForConditionalGeneration.from_pretrained(args.model_name)
  model.config.forced_decoder_ids = processor.get_decoder_prompt_ids(language=args.language, task=args.task)
  model.config.suppress_tokens = []

  def preprocess(batch: dict[str, Any]) -> dict[str, Any]:
    audio = batch["audio"]
    batch["input_features"] = feature_extractor(audio["array"], sampling_rate=audio["sampling_rate"]).input_features[0]
    batch["labels"] = tokenizer(batch["transcription"]).input_ids
    return batch

  dataset = dataset.map(preprocess, remove_columns=dataset["train"].column_names, num_proc=1)

  training_args = Seq2SeqTrainingArguments(
    output_dir=args.output_dir,
    per_device_train_batch_size=args.batch_size,
    learning_rate=args.learning_rate,
    num_train_epochs=args.num_epochs,
    gradient_accumulation_steps=2,
    logging_steps=25,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    predict_with_generate=True,
    generation_max_length=225,
    fp16=False,
    report_to="none",
  )

  trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["test"],
    tokenizer=processor.feature_extractor,
    data_collator=DataCollatorSpeechSeq2Seq(processor=processor),
  )

  trainer.train()
  trainer.save_model(args.output_dir)
  processor.save_pretrained(args.output_dir)
  print(f"Fine-tuned model saved to {args.output_dir}")


if __name__ == "__main__":
  main()
