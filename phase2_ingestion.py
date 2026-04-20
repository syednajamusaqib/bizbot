#!/usr/bin/env python3
"""
Phase 2 v2: Weaviate Ingestion — ENRICHED DATA
================================================
Reads from enriched_data/products_hierarchical.json (with embeddings from Phase 1)

Changes from original:
  1. NEW: product_type, color, fabric, season as filterable properties
  2. FIX: category_l2 = gender (Men/Women/Boys/Girls/Kids/Unisex)
  3. FIX: category_l1 = top-level (Clothing/Fragrances/Footwear/Accessories/Makeup/Beauty)
  4. NEW: product_attributes stored (sizes, wear_type, fit_type)
  5. FIX: BM25 corpus exported with complete metadata
  6. FIX: notes_text vector uses actual notes_combined embedding (not detailed chunk)
"""

import json, os, re, time
from pathlib import Path
from typing import List, Dict, Any, Optional
from tqdm import tqdm
import weaviate
from weaviate.classes.config import Configure, Property, DataType
from weaviate.util import generate_uuid5
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

COLLECTION_NAME = "Product"
MODEL           = "text-embedding-3-large"   

BASE_DIR = Path(__file__).parent
try:
    from config import EMBEDDINGS_OUTPUT as EMBEDDINGS_PATH, BM25_CORPUS_PATH as BM25_OUT
except ImportError:
    EMBEDDINGS_PATH = BASE_DIR / "enriched_data" / "products_with_embeddings.json"
    BM25_OUT        = BASE_DIR / "enriched_data" / "bm25_corpus_enriched.json"

# ── Utility ──────────────────────────────────────────────────────────────────
def parse_size_ml(size_str: str) -> float:
    if not size_str:
        return 0.0
    match = re.search(r"(\d+(?:\.\d+)?)\s*ml", size_str, re.IGNORECASE)
    return float(match.group(1)) if match else 0.0

# ── Schema ────────────────────────────────────────────────────────────────────
def create_schema(client: weaviate.WeaviateClient):
    print("\n📋 Creating Weaviate schema...")
    if client.collections.exists(COLLECTION_NAME):
        client.collections.delete(COLLECTION_NAME)
        print(f"  Deleted existing {COLLECTION_NAME} collection")

    client.collections.create(
        name=COLLECTION_NAME,
        description="J. e-commerce products — clothing, fragrances, footwear, accessories, beauty",

        # ── Named vectors ─────────────────────────────────────────────────
        vectorizer_config=[
            Configure.NamedVectors.none(name="primary_text"),    # main product description
            Configure.NamedVectors.none(name="detailed_text"),   # notes / fabric / description
            Configure.NamedVectors.none(name="notes_text"),      # notes_combined embedding
            Configure.NamedVectors.none(name="hyde_query"),      # averaged HyDE query
            Configure.NamedVectors.none(name="hyde_answer"),     # averaged HyDE answer
        ],

        # ── Properties ────────────────────────────────────────────────────
        properties=[
            # Identifiers
            Property(name="product_id",     data_type=DataType.TEXT,   skip_vectorization=True),
            Property(name="sku",            data_type=DataType.TEXT,   skip_vectorization=True),
            Property(name="product_link",   data_type=DataType.TEXT,   skip_vectorization=True),
            Property(name="image_path",     data_type=DataType.TEXT,   skip_vectorization=True),
            Property(name="image_url",      data_type=DataType.TEXT,   skip_vectorization=True),

            # Core text (BM25 + vector)
            Property(name="name",           data_type=DataType.TEXT),
            Property(name="primary_text",   data_type=DataType.TEXT),
            Property(name="detailed_text",  data_type=DataType.TEXT),
            Property(name="notes_combined", data_type=DataType.TEXT),
            Property(name="raw_description",data_type=DataType.TEXT),

            # ── FILTER PROPERTIES ─────────────────────────────────────────
            # Price
            Property(name="price_numeric",  data_type=DataType.NUMBER),
            Property(name="price_display",  data_type=DataType.TEXT,  skip_vectorization=True),
            Property(name="price_bucket",   data_type=DataType.TEXT,  skip_vectorization=True),

            # Stock
            Property(name="in_stock",       data_type=DataType.BOOL),
            Property(name="stock_status",   data_type=DataType.TEXT,  skip_vectorization=True),

            # Category hierarchy
            Property(name="category_l1",    data_type=DataType.TEXT),  # Clothing/Fragrances/Footwear/...
            Property(name="category_l2",    data_type=DataType.TEXT),  # Men/Women/Boys/Girls/Kids/Unisex
            Property(name="product_type",   data_type=DataType.TEXT),  # Kurta/Perfume/Sandals/Kurti/...

            # Product attributes
            Property(name="color",          data_type=DataType.TEXT),
            Property(name="fabric",         data_type=DataType.TEXT),
            Property(name="season",         data_type=DataType.TEXT,  skip_vectorization=True),
            Property(name="wear_type",      data_type=DataType.TEXT,  skip_vectorization=True),
            Property(name="fit_type",       data_type=DataType.TEXT,  skip_vectorization=True),
            Property(name="sizes_available",data_type=DataType.TEXT_ARRAY, skip_vectorization=True),

            # Fragrance
            Property(name="fragrance_category", data_type=DataType.TEXT),
            Property(name="notes_top",      data_type=DataType.TEXT),
            Property(name="notes_heart",    data_type=DataType.TEXT),
            Property(name="notes_base",     data_type=DataType.TEXT),
            Property(name="main_accords",   data_type=DataType.TEXT),

            # Size
            Property(name="size",           data_type=DataType.TEXT,  skip_vectorization=True),
            Property(name="size_ml_numeric",data_type=DataType.NUMBER),

            # Image
            Property(name="has_image",      data_type=DataType.BOOL),

            # Keywords array for hybrid BM25 boost
            Property(name="keywords",       data_type=DataType.TEXT_ARRAY),
        ],
    )
    print(f"✓ Schema created with 5 named vectors + 33 properties")

# ── Object preparation ───────────────────────────────────────────────────────
def prepare_object(product: Dict) -> Optional[Dict]:
    try:
        core   = product.get("product_core", {})
        fm     = product.get("fragrance_metadata", {})
        filt   = product.get("filter_metadata", {})
        img    = product.get("image_data", {})
        sparse = product.get("sparse_retrieval", {})
        hyde   = product.get("hyde_components", {})
        chunks = product.get("searchable_chunks", [])
        pa     = product.get("product_attributes", {})

        primary_chunk  = chunks[0] if len(chunks) > 0 else {}
        detailed_chunk = chunks[1] if len(chunks) > 1 else {}

        size_str = fm.get("size", "") or filt.get("size_category", "")

        properties = {
            # Identifiers
            "product_id":     product.get("product_id", ""),
            "sku":            str(core.get("sku", "")),
            "product_link":   core.get("product_link", ""),
            "image_path":     img.get("local_path", ""),
            "image_url":      img.get("online_url", ""),

            # Core text
            "name":           core.get("name", ""),
            "primary_text":   primary_chunk.get("content", ""),
            "detailed_text":  detailed_chunk.get("content", ""),
            "notes_combined": product.get("notes_combined", ""),
            "raw_description":product.get("raw_description", ""),

            # Price
            "price_numeric":  float(core.get("price_numeric", 0)),
            "price_display":  core.get("price_display", ""),
            "price_bucket":   filt.get("price_range_bucket", ""),

            # Stock
            "in_stock":       bool(filt.get("in_stock", False)),
            "stock_status":   core.get("stock_status", ""),

            # Category hierarchy
            "category_l1":    filt.get("category_l1", ""),
            "category_l2":    filt.get("category_l2", ""),         
            "product_type":   filt.get("product_type", ""),        

            # Product attributes
            "color":          pa.get("color", ""),                 
            "fabric":         pa.get("fabric", ""),                 
            "season":         pa.get("season", ""),                
            "wear_type":      pa.get("wear_type", ""),             
            "fit_type":       pa.get("fit_type", ""),              
            "sizes_available": pa.get("sizes_available", []),      

            # Fragrance
            "fragrance_category": fm.get("fragrance_category", ""),
            "notes_top":      fm.get("notes_top", ""),
            "notes_heart":    fm.get("notes_heart", ""),
            "notes_base":     fm.get("notes_base", ""),
            "main_accords":   fm.get("main_accords", ""),

            # Size
            "size":           size_str,
            "size_ml_numeric": filt.get("size_ml_numeric", 0.0),

            # Image
            "has_image":      bool(img.get("image_exists", False)),

            # Keywords
            "keywords":       sparse.get("keywords", []),
        }

        # ── Named vectors ─────────────────────────────────────────────────
        vectors = {}
        if primary_chunk.get("embedding"):
            vectors["primary_text"]  = primary_chunk["embedding"]
        if detailed_chunk.get("embedding"):
            vectors["detailed_text"] = detailed_chunk["embedding"]

        notes_emb = detailed_chunk.get("embedding") or primary_chunk.get("embedding")
        if notes_emb:
            vectors["notes_text"] = notes_emb

        if hyde.get("hyde_query_avg") and any(hyde["hyde_query_avg"]):
            vectors["hyde_query"]  = hyde["hyde_query_avg"]
        if hyde.get("hyde_answer_avg") and any(hyde["hyde_answer_avg"]):
            vectors["hyde_answer"] = hyde["hyde_answer_avg"]

        return {"properties": properties, "vectors": vectors}

    except Exception as e:
        print(f"Skipping {product.get('product_id')}: {e}")
        return None

# ── Ingestion ─────────────────────────────────────────────────────────────────
def ingest_all(wv_client: weaviate.WeaviateClient, products: List[Dict]) -> Dict:
    stats = {"ingested": 0, "failed": 0, "vectors_per_type": {}}
    collection = wv_client.collections.get(COLLECTION_NAME)

    with tqdm(total=len(products), desc="Ingesting products") as pbar:
        for i in range(0, len(products), 100):
            batch = products[i : i + 100]
            with collection.batch.dynamic() as wb:
                for product in batch:
                    obj = prepare_object(product)
                    if obj is None:
                        stats["failed"] += 1
                        continue
                    try:
                        uuid = generate_uuid5(obj["properties"]["product_id"])
                        wb.add_object(
                            properties=obj["properties"],
                            vector=obj["vectors"],
                            uuid=uuid,
                        )
                        stats["ingested"] += 1
                        for k in obj["vectors"]:
                            stats["vectors_per_type"][k] = stats["vectors_per_type"].get(k, 0) + 1
                    except Exception as e:
                        stats["failed"] += 1
            pbar.update(len(batch))

    return stats

# ── BM25 corpus export ────────────────────────────────────────────────────────
def export_bm25_corpus(products: List[Dict], output_path: Path):
    """Re-export BM25 corpus from embedded data (with all metadata intact)."""
    corpus = []
    for product in products:
        core  = product.get("product_core", {})
        fm    = product.get("fragrance_metadata", {})
        filt  = product.get("filter_metadata", {})
        pa    = product.get("product_attributes", {})
        chunks= product.get("searchable_chunks", [])
        sparse= product.get("sparse_retrieval", {})

        text_parts = [
            core.get("name", ""),
            filt.get("product_type", ""),
            filt.get("category_l2", ""),
            chunks[0].get("content", "") if chunks else "",
            chunks[1].get("content", "") if len(chunks) > 1 else "",
            product.get("notes_combined", ""),
            fm.get("fragrance_category", ""),
            pa.get("color", ""),
            pa.get("fabric", ""),
            product.get("raw_description", ""),
        ]
        text = " ".join(p for p in text_parts if p and p.strip() and p.strip() != "N/A")

        corpus.append({
            "doc_id":   product.get("product_id", ""),
            "text":     text,
            "keywords": sparse.get("keywords", []),
            "metadata": {
                "name":          core.get("name", ""),
                "price":         core.get("price_numeric", 0),
                "in_stock":      filt.get("in_stock", False),
                "stock":         filt.get("in_stock", False),
                "category_l1":   filt.get("category_l1", ""),
                "category_l2":   filt.get("category_l2", ""),
                "product_type":  filt.get("product_type", ""),
                "color":         pa.get("color", ""),
                "fabric":        pa.get("fabric", ""),
                "season":        pa.get("season", ""),
                "fragrance_cat": fm.get("fragrance_category", ""),
                "size":          fm.get("size", ""),
                "notes_top":     fm.get("notes_top", ""),
                "notes_heart":   fm.get("notes_heart", ""),
                "notes_base":    fm.get("notes_base", ""),
                "price_bucket":  filt.get("price_range_bucket", ""),
            }
        })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(corpus, f, indent=2, ensure_ascii=False)
    print(f"✓ BM25 corpus saved: {len(corpus)} documents → {output_path}")

# ── Verification ─────────────────────────────────────────────────────────────
def verify(wv_client: weaviate.WeaviateClient):
    print("\nVerifying ingestion...")
    collection = wv_client.collections.get(COLLECTION_NAME)
    result     = collection.aggregate.over_all(total_count=True)
    print(f"✓ Total objects in Weaviate: {result.total_count}")

    sample = collection.query.fetch_objects(limit=5)
    for obj in sample.objects:
        p = obj.properties
        print(f"  • {p['name']} | {p['category_l2']} | {p['product_type']} | PKR {p['price_numeric']} | {p.get('color','')} | {p.get('fabric','')}")

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("PHASE 2 v2: WEAVIATE INGESTION (ENRICHED DATA)")
    print("=" * 70)

    embeddings_path = EMBEDDINGS_PATH
    bm25_out = BM25_OUT

    print(f"Loading data from: {embeddings_path}")

    if not embeddings_path.exists():
        print(f"Embeddings file not found: {embeddings_path}")
        print("   Run phase1_embed_fixed.py first"); return

    with open(embeddings_path, "r", encoding="utf-8") as f:
        products = json.load(f)
    print(f"✓ {len(products)} products loaded")

    # Connect
    wv = weaviate.connect_to_local(
        host="localhost", port=8081,
        headers={"X-OpenAI-Api-Key": os.getenv("OPENAI_API_KEY", "")},
    )
    if not wv.is_ready():
        print("Weaviate not ready. Run: docker-compose up -d"); return
    print(f"✓ Connected to Weaviate v{wv.get_meta()['version']}")

    create_schema(wv)

    start  = time.time()
    stats  = ingest_all(wv, products)
    elapsed= time.time() - start

    print(f"\nIngestion complete in {elapsed:.1f}s")
    print(f"   Ingested: {stats['ingested']} | Failed: {stats['failed']}")
    print(f"   Vector types: {stats['vectors_per_type']}")

    verify(wv)
    wv.close()

    export_bm25_corpus(products, bm25_out)

    print("\n" + "=" * 70)
    print("PHASE 2 COMPLETE — Next: run phase3_rag_api_v2.py")
    print("=" * 70)


if __name__ == "__main__":
    main()
