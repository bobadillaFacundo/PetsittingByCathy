from src.database.db_urls import ddl_url_candidates, supabase_direct_from_pooler


POOLER = (
    "postgresql://postgres.abcdefghijklmn:p%40ss@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
)


def test_builds_direct_host_from_pooler():
    direct = supabase_direct_from_pooler(POOLER)
    assert "postgres:p%40ss@db.abcdefghijklmn.supabase.co:5432/postgres" in direct


def test_candidates_prefer_session_pooler_before_transaction_pooler():
    urls = ddl_url_candidates(POOLER, None)
    assert any(":5432" in u and "pooler.supabase.com" in u for u in urls)
    assert urls[-1].startswith(POOLER.split("?")[0]) or ":6543" in urls[-1]
