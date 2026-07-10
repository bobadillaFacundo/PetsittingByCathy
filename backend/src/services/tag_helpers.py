"""Helpers para tablas normalizadas de IA (variantes, keywords, sinónimos)."""

from typing import Optional
from sqlalchemy.orm import Session, joinedload
from src.models.models import (
    TagSet, TagVariant, ColorRule, ColorRuleKeyword,
    DataDictionary, DataDictionarySynonym,
)


def parse_csv_values(raw: str) -> list[str]:
    return [v.strip() for v in (raw or "").split(",") if v.strip()]


def join_values(values: list[str]) -> str:
    return ", ".join(values)


# --- TagSet / TagVariant ---

def get_tag_variants(tag_set: TagSet) -> list[str]:
    return sorted({v.variant for v in tag_set.variants_rel})


def get_tag_variants_text(tag_set: TagSet) -> str:
    return join_values(get_tag_variants(tag_set))


def load_tag_sets(db: Session) -> list[TagSet]:
    return db.query(TagSet).options(joinedload(TagSet.variants_rel)).all()


def set_tag_variants(db: Session, tag_set: TagSet, variants: list[str]) -> None:
    normalized = sorted({v.strip().lower() for v in variants if v and v.strip()})
    db.query(TagVariant).filter(TagVariant.tag_set_id == tag_set.id).delete()
    tag_set.variants_rel.clear()
    db.flush()
    for variant in normalized:
        tag_set.variants_rel.append(TagVariant(variant=variant))


def add_tag_variant(db: Session, tag_set: TagSet, spoken_variant: str) -> bool:
    spk = spoken_variant.lower().strip()
    if not spk:
        return False
    existing = {v.variant.lower() for v in tag_set.variants_rel}
    if spk in existing:
        return False
    tag_set.variants_rel.append(TagVariant(variant=spk))
    return True


def tag_set_to_dict(tag_set: TagSet) -> dict:
    variants = get_tag_variants(tag_set)
    return {
        "id": tag_set.id,
        "name": tag_set.name,
        "variants": variants,
        "variants_text": join_values(variants),
    }


# --- ColorRule / ColorRuleKeyword ---

def get_color_keywords(rule: ColorRule) -> list[str]:
    return sorted({k.keyword for k in rule.keywords_rel})


def get_color_keywords_text(rule: ColorRule) -> str:
    return join_values(get_color_keywords(rule))


def load_color_rules(db: Session, color: Optional[str] = None) -> list[ColorRule]:
    q = db.query(ColorRule).options(joinedload(ColorRule.keywords_rel))
    if color:
        q = q.filter(ColorRule.color == color)
    return q.all()


def set_color_keywords(db: Session, rule: ColorRule, keywords: list[str]) -> None:
    normalized = sorted({k.strip().lower() for k in keywords if k and k.strip()})
    db.query(ColorRuleKeyword).filter(ColorRuleKeyword.color_rule_id == rule.id).delete()
    rule.keywords_rel.clear()
    db.flush()
    for keyword in normalized:
        rule.keywords_rel.append(ColorRuleKeyword(keyword=keyword))


def color_rule_to_dict(rule: ColorRule) -> dict:
    keywords = get_color_keywords(rule)
    return {
        "id": rule.id,
        "color": rule.color,
        "match_type": rule.match_type,
        "keywords": join_values(keywords),
        "keywords_list": keywords,
    }


def detect_keywords_in_text(text: str, rules: list[ColorRule]) -> list[str]:
    if not text:
        return []
    text_lower = text.lower()
    found = []
    for rule in rules:
        for kw in get_color_keywords(rule):
            if rule.match_type == "exact" and kw == text_lower:
                found.append(kw)
            elif rule.match_type == "partial" and kw in text_lower:
                found.append(kw)
    return list(set(found))


# --- DataDictionary / Synonyms ---

def get_dictionary_synonyms(dictionary: DataDictionary) -> list[str]:
    return sorted({s.synonym for s in dictionary.synonyms_rel})


def set_dictionary_synonyms(db: Session, dictionary: DataDictionary, synonyms: list[str]) -> None:
    normalized = sorted({s.strip().lower() for s in synonyms if s and s.strip()})
    db.query(DataDictionarySynonym).filter(
        DataDictionarySynonym.dictionary_id == dictionary.id
    ).delete()
    dictionary.synonyms_rel.clear()
    db.flush()
    for synonym in normalized:
        dictionary.synonyms_rel.append(DataDictionarySynonym(synonym=synonym))
