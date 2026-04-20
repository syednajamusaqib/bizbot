#!/usr/bin/env python3
"""
Phase 1 FIXED: Generate OpenAI Embeddings
Fixes:
  1. Consistent text-embedding-3-large (3072 dims) across all phases
  2. Off-by-one embedding alignment bug (empty chunk guard on BOTH loops)
  3. Enriches fragrance_category from products_attribute_indexed.json
  4. Averages ALL HyDE embeddings (not just first)
  5. Adds notes_combined field for unified note search
"""

import json, os, time, re
from typing import List, Dict, Any, Optional
from pathlib import Path
from datetime import datetime
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv
from config import HIERARCHICAL_JSON, ATTRIBUTE_INDEXED_JSON, EMBEDDINGS_DIR, EMBEDDINGS_OUTPUT

load_dotenv()

MODEL         = "text-embedding-3-large"
DIMS          = 3072
BATCH_SIZE    = 50
MAX_RETRIES   = 3
RETRY_DELAY   = 2

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def parse_fragrance_category(by_category_text: str) -> str:
    """
    Input:  "For Women Floral, Fruity"  or  "For Men Woody"  or  "For Women "
    Output: "Floral, Fruity"  /  "Woody"  /  ""
    """
    text = by_category_text.strip()
    for prefix in ("For Women", "For Men", "For Unisex"):
        if text.startswith(prefix):
            remainder = text[len(prefix):].strip()
            return remainder
    return text

def build_attribute_lookup(attr_indexed_path: Path) -> Dict[str, Dict]:
    """Build product_id -> enriched metadata from attribute_indexed JSON."""
    if not attr_indexed_path.exists():
        print(f"attribute_indexed not found at {attr_indexed_path}, skipping enrichment")
        return {}
    with open(attr_indexed_path, "r", encoding="utf-8") as f:
        items = json.load(f)
    lookup = {}
    for item in items:
        pid = item.get("product_id", "")
        facets = item.get("searchable_facets", {})
        by_cat  = facets.get("by_category", {}).get("text", "")
        frag_cat = parse_fragrance_category(by_cat)
        lookup[pid] = {
            "fragrance_category": frag_cat,
            "raw_category_text": by_cat,
        }
    print(f"✓ Built attribute lookup for {len(lookup)} products")
    return lookup

def embed_batch(texts: List[str], retry: int = 0) -> List[List[float]]:
    """Embed a list of texts; returns list of 3072-dim vectors."""
    if not texts:
        return []

    valid, valid_idx = [], []
    for i, t in enumerate(texts):
        if t and isinstance(t, str) and t.strip():
            valid.append(t.strip())
            valid_idx.append(i)

    if not valid:
        return [[0.0] * DIMS for _ in texts]

    try:
        resp = client.embeddings.create(
            model=MODEL, input=valid, encoding_format="float"
        )
        valid_vecs = [item.embedding for item in resp.data]

        if len(valid) == len(texts):
            return valid_vecs

        result = [[0.0] * DIMS for _ in texts]
        for new_i, orig_i in enumerate(valid_idx):
            result[orig_i] = valid_vecs[new_i]
        return result

    except Exception as e:
        if retry < MAX_RETRIES:
            time.sleep(RETRY_DELAY * (retry + 1))
            return embed_batch(texts, retry + 1)
        print(f"embed_batch failed: {e}")
        return [[0.0] * DIMS for _ in texts]

def average_vectors(vecs: List[List[float]]) -> List[float]:
    """Average a list of same-dim vectors into one representative vector."""
    if not vecs:
        return [0.0] * DIMS
    if len(vecs) == 1:
        return vecs[0]
    avg = [sum(col) / len(vecs) for col in zip(*vecs)]
    norm = sum(x * x for x in avg) ** 0.5
    if norm > 0:
        avg = [x / norm for x in avg]
    return avg

def process_product_batch(
    products: List[Dict],
    attr_lookup: Dict[str, Dict],
) -> List[Dict]:
    """
    1. Enrich fragrance_category and notes_combined on each product.
    2. Collect ALL non-empty text segments (chunks + all HyDE queries + answers).
    3. Embed them in one pass.
    4. Assign embeddings back with the SAME guard used during collection
       (fixing the off-by-one bug).
    5. Store averaged HyDE embedding.
    """

    for product in products:
        pid = product.get("product_id", "")

        fm = product.setdefault("fragrance_metadata", {})
        if not fm.get("fragrance_category") and pid in attr_lookup:
            fm["fragrance_category"] = attr_lookup[pid]["fragrance_category"]

        parts = [
            fm.get("notes_top", ""),
            fm.get("notes_heart", ""),
            fm.get("notes_base", ""),
            fm.get("main_accords", ""),
        ]
        product["notes_combined"] = " | ".join(p for p in parts if p.strip())

        chunks = product.get("searchable_chunks", [])
        if chunks and fm.get("fragrance_category"):
            primary = chunks[0]
            if fm["fragrance_category"] not in primary.get("content", ""):
                primary["content"] = (
                    primary.get("content", "").rstrip(".")
                    + f". {fm['fragrance_category']} fragrance."
                )


    items = []  

    SECTIONS = ("chunk", "hyde_query", "hyde_answer")

    for pi, product in enumerate(products):
        if not isinstance(product, dict):
            continue

        for ci, chunk in enumerate(product.get("searchable_chunks", [])):
            content = chunk.get("content", "")
            if content and isinstance(content, str) and content.strip(): 
                items.append((pi, "chunk", ci, content.strip()))

        hyde = product.get("hyde_components", {})

        for qi, q in enumerate(hyde.get("hypothetical_queries", [])):
            if q and isinstance(q, str) and q.strip():               
                items.append((pi, "hyde_query", qi, q.strip()))

        for ai, a in enumerate(hyde.get("hypothetical_answers", [])):
            if a and isinstance(a, str) and a.strip():               
                items.append((pi, "hyde_answer", ai, a.strip()))

    if not items:
        return products

    texts = [x[3] for x in items]
    all_vecs = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch_vecs = embed_batch(texts[i : i + BATCH_SIZE])
        all_vecs.extend(batch_vecs)
        if i + BATCH_SIZE < len(texts):
            time.sleep(0.3)


    from collections import defaultdict
    pdata: Dict[int, Dict[str, Dict[int, List[float]]]] = defaultdict(
        lambda: {"chunk": {}, "hyde_query": {}, "hyde_answer": {}}
    )

    for (pi, section, sub_idx, _text), vec in zip(items, all_vecs):
        pdata[pi][section][sub_idx] = vec

    for pi, product in enumerate(products):
        if not isinstance(product, dict):
            continue

        for ci, chunk in enumerate(product.get("searchable_chunks", [])):
            content = chunk.get("content", "")
            if content and isinstance(content, str) and content.strip():  
                if ci in pdata[pi]["chunk"]:
                    chunk["embedding"] = pdata[pi]["chunk"][ci]
                    chunk.pop("embedding_placeholder", None)

        hyde = product.setdefault("hyde_components", {})

        query_vecs = [
            pdata[pi]["hyde_query"][qi]
            for qi in sorted(pdata[pi]["hyde_query"])
        ]
        answer_vecs = [
            pdata[pi]["hyde_answer"][ai]
            for ai in sorted(pdata[pi]["hyde_answer"])
        ]

        hyde["query_embeddings"]  = query_vecs
        hyde["answer_embeddings"] = answer_vecs
        hyde["hyde_query_avg"]  = average_vectors(query_vecs)
        hyde["hyde_answer_avg"] = average_vectors(answer_vecs)
        hyde.pop("hyde_embedding_placeholder", None)

    return products


def main():
    print("=" * 70)
    print("PHASE 1 FIXED: EMBEDDING GENERATION")
    print(f"  Model: {MODEL}  |  Dims: {DIMS}")
    print("=" * 70)

    from config import (
        HIERARCHICAL_JSON      as hierarchical_path,
        ATTRIBUTE_INDEXED_JSON as attr_indexed_path,
        EMBEDDINGS_DIR         as output_dir,
        EMBEDDINGS_OUTPUT      as output_path,
    )
    stats_path = output_dir / "embedding_statistics.json"
    output_dir.mkdir(parents=True, exist_ok=True)

    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set"); return

    print(f"\nLoading hierarchical products: {hierarchical_path}")
    with open(hierarchical_path, "r", encoding="utf-8") as f:
        products = json.load(f)
    print(f"✓ {len(products)} products loaded")

    attr_lookup = build_attribute_lookup(attr_indexed_path)

    start = time.time()
    processed = []
    PROD_BATCH = 30

    with tqdm(total=len(products), desc="Embedding products") as pbar:
        for i in range(0, len(products), PROD_BATCH):
            batch = products[i : i + PROD_BATCH]
            result = process_product_batch(batch, attr_lookup)
            processed.extend(result)
            pbar.update(len(batch))

    elapsed = time.time() - start

    print(f"\nSaving to {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(processed, f, indent=2, ensure_ascii=False)

    total_chunks = sum(
        1 for p in processed
        for c in p.get("searchable_chunks", [])
        if c.get("embedding") and c["content"].strip()
    )
    stats = {
        "model": MODEL, "dims": DIMS, "products": len(processed),
        "embedded_chunks": total_chunks, "processing_seconds": round(elapsed, 2),
        "generated_at": datetime.now().isoformat(),
    }
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)

    print(f"Done in {elapsed:.1f}s | {len(processed)} products | {total_chunks} chunks embedded")
    print("Next: run phase2_ingest_fixed.py")


if __name__ == "__main__":
    main()
