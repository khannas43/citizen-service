"""
Run ONCE after pgvector is installed and ai schema is created.
Usage: python scripts/embed_services.py
Reads service_catalogue.json, embeds each entry, inserts into ai.service_embedding.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pgvector.asyncpg import Vector

from app.db import close_pool, get_pool
from models.embedder import embed

CATALOGUE_PATH = os.path.join(os.path.dirname(__file__), "../data/service_catalogue.json")


async def main():
    with open(CATALOGUE_PATH, encoding="utf-8") as f:
        catalogue = json.load(f)

    pool = await get_pool()
    async with pool.acquire() as conn:
        for svc in catalogue:
            text = (
                f"{svc['name']} {svc.get('name_gu', '')} {svc.get('description', '')} "
                f"{' '.join(svc.get('synonyms', []))}"
            )
            vec = embed(text)
            await conn.execute(
                """
                INSERT INTO ai.service_embedding
                    (service_key, service_name, service_name_gu,
                     description, route, synonyms, embedding)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (service_key) DO UPDATE SET
                    embedding    = EXCLUDED.embedding,
                    service_name = EXCLUDED.service_name,
                    description  = EXCLUDED.description,
                    route        = EXCLUDED.route,
                    synonyms     = EXCLUDED.synonyms
                """,
                svc["key"],
                svc["name"],
                svc.get("name_gu"),
                svc.get("description"),
                svc.get("route"),
                svc.get("synonyms", []),
                Vector(vec),
            )
            print(f"  ✓ embedded: {svc['name']}")

    await close_pool()
    print("\nDone. All services embedded into ai.service_embedding.")


if __name__ == "__main__":
    asyncio.run(main())
