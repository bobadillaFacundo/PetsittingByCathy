from src.database.db_urls import ddl_url_candidates, supabase_direct_from_pooler


POOLER = (
    "postgresql://postgres.abcdefghijklmn:p%40ss@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
)


def test_builds_direct_host_from_pooler():
    direct = supabase_direct_from_pooler(POOLER)
    assert direct == "postgresql://postgres:p%40ss@db.abcdefghijklmn.supabase.co:5432/postgres"


def test_candidates_prefer_explicit_direct_then_fallbacks():
    urls = ddl_url_candidates(POOLER, "postgresql://postgres:x@db.abcdefghijklmn.supabase.co:5432/postgres")
    assert urls[0].endswith("db.abcdefghijklmn.supabase.co:5432/postgres")
    assert POOLER in urls
    assert any(":5432" in u and "pooler.supabase.com" in u for u in urls)
