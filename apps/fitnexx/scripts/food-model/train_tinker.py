#!/usr/bin/env python3
"""Train a Qwen3.5-4B vision LoRA from a prepared Fitnexx dataset."""

import argparse
import asyncio
import json
import math
import random
from pathlib import Path

import tinker
from PIL import Image
from tinker_cookbook.image_processing_utils import get_image_processor, resize_image
from tinker_cookbook.renderers import ImagePart, Message, TextPart, TrainOnWhat, get_renderer
from tinker_cookbook.supervised import train
from tinker_cookbook.supervised.common import datum_from_model_input_weights
from tinker_cookbook.supervised.types import SupervisedDataset, SupervisedDatasetBuilder
from tinker_cookbook.tokenizer_utils import get_tokenizer

PROMPT = (
    "List each distinct visible food or drink. Return JSON with an items array "
    "containing name, count, portionDescription, portionBucket, preparation, and confidence."
)


class FoodDataset(SupervisedDataset):
    def __init__(self, root: Path, split: str, batch_size: int, model: str):
        self.root, self.batch_size = root, batch_size
        self.rows = [
            json.loads(line)
            for line in (root / "manifest.jsonl").read_text().splitlines()
            if json.loads(line)["split"] == split
        ]
        tokenizer = get_tokenizer(model)
        processor = get_image_processor(model)
        self.renderer = get_renderer("qwen3_5_disable_thinking", tokenizer, processor)
        self.indices = list(range(len(self.rows)))

    def get_batch(self, index: int) -> list[tinker.Datum]:
        result = []
        for row_index in self.indices[index * self.batch_size : (index + 1) * self.batch_size]:
            row = self.rows[row_index]
            image = resize_image(Image.open(self.root / row["image"]), max_size=960)
            messages = [
                Message(role="user", content=[ImagePart(type="image", image=image), TextPart(type="text", text=PROMPT)]),
                Message(role="assistant", content=[TextPart(type="text", text=json.dumps({"items": row["target"]}, separators=(",", ":")))]),
            ]
            example = self.renderer.build_supervised_example(
                messages=messages,
                train_on_what=TrainOnWhat.LAST_ASSISTANT_MESSAGE,
            )
            result.append(datum_from_model_input_weights(*example, max_length=4096))
        return result

    def __len__(self) -> int:
        return math.ceil(len(self.rows) / self.batch_size)

    def set_epoch(self, seed: int = 0):
        random.Random(seed).shuffle(self.indices)


class FoodDatasetBuilder(SupervisedDatasetBuilder):
    def __init__(self, root: Path, batch_size: int, model: str):
        self.root, self.batch_size, self.model = root, batch_size, model

    def __call__(self):
        training = FoodDataset(self.root, "train", self.batch_size, self.model)
        evaluation = FoodDataset(self.root, "eval", self.batch_size, self.model)
        return training, evaluation if evaluation.rows else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", default="food-training-runs")
    parser.add_argument("--model", default="Qwen/Qwen3.5-4B")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=4)
    args = parser.parse_args()
    config = train.Config(
        log_path=str(Path(args.output) / args.dataset.name),
        model_name=args.model,
        recipe_name="fitnexx_food_vlm",
        renderer_name="qwen3_5_disable_thinking",
        dataset_builder=FoodDatasetBuilder(args.dataset, args.batch_size, args.model),
        learning_rate=1e-4,
        lora_rank=16,
        num_epochs=args.epochs,
        save_every=20,
        eval_every=20,
    )
    asyncio.run(train.main(config))


if __name__ == "__main__":
    main()
