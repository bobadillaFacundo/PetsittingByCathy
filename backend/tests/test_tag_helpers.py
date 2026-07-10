"""Tests unitarios para tag_helpers (variantes, keywords, sinónimos)."""

import pytest
from src.models.models import TagSet, ColorRule, DataDictionary
from src.services.tag_helpers import (
    parse_csv_values,
    join_values,
    get_tag_variants,
    set_tag_variants,
    add_tag_variant,
    tag_set_to_dict,
    get_color_keywords,
    set_color_keywords,
    color_rule_to_dict,
    detect_keywords_in_text,
    set_dictionary_synonyms,
    get_dictionary_synonyms,
    load_color_rules,
    load_tag_sets,
)


@pytest.mark.unit
class TestParseCsv:
    @pytest.mark.parametrize("raw,expected", [
        ("a, b, c", ["a", "b", "c"]),
        ("comió, morfó", ["comió", "morfó"]),
        ("  uno  ,  dos  ", ["uno", "dos"]),
        ("", []),
        (None, []),
        ("solo", ["solo"]),
        ("a,,b", ["a", "b"]),
        ("NO, nada, NINGUNO", ["NO", "nada", "NINGUNO"]),
        ("sangre,vomito,diarrea", ["sangre", "vomito", "diarrea"]),
    ])
    def test_parse_csv_values(self, raw, expected):
        assert parse_csv_values(raw) == expected

    def test_join_values(self):
        assert join_values(["a", "b"]) == "a, b"


@pytest.mark.unit
class TestTagVariants:
    def test_set_and_get_variants(self, db):
        ts = TagSet(name="Pis")
        db.add(ts)
        db.flush()
        set_tag_variants(db, ts, ["meó", "MEÓ", "  meo  ", "meó"])
        db.commit()
        db.refresh(ts)
        variants = get_tag_variants(ts)
        assert len(variants) == 2
        assert "meo" in variants

    def test_add_tag_variant_new(self, db):
        ts = TagSet(name="Caca")
        db.add(ts)
        db.flush()
        assert add_tag_variant(db, ts, "garcó") is True
        assert add_tag_variant(db, ts, "garcó") is False
        assert add_tag_variant(db, ts, "") is False

    def test_tag_set_to_dict(self, db):
        ts = TagSet(name="Agua")
        db.add(ts)
        db.flush()
        set_tag_variants(db, ts, ["bebió", "tomó"])
        d = tag_set_to_dict(ts)
        assert d["name"] == "Agua"
        assert "bebió" in d["variants"]
        assert "tomó" in d["variants_text"]

    def test_load_tag_sets(self, db, seed):
        sets = load_tag_sets(db)
        assert len(sets) >= 1
        assert any(s.name == "Comida" for s in sets)


@pytest.mark.unit
class TestColorKeywords:
    def test_set_and_get_keywords(self, db):
        rule = ColorRule(color="red", match_type="exact")
        db.add(rule)
        db.flush()
        set_color_keywords(db, rule, ["NO", "nada", "nada"])
        assert get_color_keywords(rule) == ["nada", "no"]

    def test_color_rule_to_dict(self, db):
        rule = ColorRule(color="yellow", match_type="partial")
        db.add(rule)
        db.flush()
        set_color_keywords(db, rule, ["poco", "blanda"])
        d = color_rule_to_dict(rule)
        assert d["color"] == "yellow"
        assert "poco" in d["keywords_list"]

    @pytest.mark.parametrize("text,match_type,keywords,expected", [
        ("no", "exact", ["no", "nada"], ["no"]),
        ("nada", "exact", ["no", "nada"], ["nada"]),
        ("comió nada", "exact", ["no", "nada"], []),
        ("tiene sangre", "partial", ["sangre", "vomito"], ["sangre"]),
        ("vomitó amarillo", "partial", ["vomitó", "diarrea"], ["vomitó"]),
        ("normal", "partial", ["sangre"], []),
        ("", "exact", ["no"], []),
        ("DIARREA acuosa", "partial", ["diarrea"], ["diarrea"]),
        ("mitad", "exact", ["poco", "mitad"], ["mitad"]),
        ("no comió nada", "partial", ["no", "sangre"], ["no"]),
    ])
    def test_detect_keywords_in_text(self, db, text, match_type, keywords, expected):
        rule = ColorRule(color="red", match_type=match_type)
        db.add(rule)
        db.flush()
        set_color_keywords(db, rule, keywords)
        found = detect_keywords_in_text(text, [rule])
        assert sorted(found) == sorted(expected)

    def test_load_color_rules_filter(self, db, seed):
        all_rules = load_color_rules(db)
        red_only = load_color_rules(db, color="red")
        assert len(all_rules) >= len(red_only)
        assert all(r.color == "red" for r in red_only)


@pytest.mark.unit
class TestDictionarySynonyms:
    def test_synonyms(self, db):
        entry = DataDictionary(
            table_name="report_events",
            entity_name="Eventos",
            fields_config="[]",
        )
        db.add(entry)
        db.flush()
        set_dictionary_synonyms(db, entry, ["comió", "COMió", "  pis  "])
        assert get_dictionary_synonyms(entry) == ["comió", "pis"]
