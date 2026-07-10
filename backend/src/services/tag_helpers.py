"""Helpers para tablas normalizadas de IA (variantes, keywords, sinónimos)."""

from typing import Optional
from sqlalchemy.orm import Session, joinedload
from src.models.models import (
    TagSet, TagVariant, ColorRule, ColorRuleKeyword,
    DataDictionary, DataDictionarySynonym,
)

# Conjuntos de rutina diaria: siempre presentes y no eliminables.
REQUIRED_TAG_SETS: dict[str, list[str]] = {
    "Comida": ["comida", "comió", "morfó", "tragó", "se alimentó", "alimento", "comio", "desayuno", "ceno"],
    "Agua": ["agua", "tomó", "bebió", "hidratación", "aguita", "tomo", "bebio", "se hidrato", "sed"],
    "Pis": ["pis", "orina", "meó", "meo", "hizo del uno", "hizo pis", "orino", "pichi"],
    "Caca": ["caca", "heces", "popó", "defecó", "cagó", "hizo del dos", "garcó", "hizo caca", "popo"],
}

REQUIRED_TAG_SET_NAMES = frozenset(REQUIRED_TAG_SETS.keys())


def parse_csv_values(raw: str) -> list[str]:
    return [v.strip() for v in (raw or "").split(",") if v.strip()]


def join_values(values: list[str]) -> str:
    return ", ".join(values)


def is_required_tag_set(name: str) -> bool:
    return bool(name) and name.strip().casefold() in {n.casefold() for n in REQUIRED_TAG_SET_NAMES}


# --- TagSet / TagVariant ---

def get_tag_variants(tag_set: TagSet) -> list[str]:
    return sorted({v.variant for v in tag_set.variants_rel})


def get_tag_variants_text(tag_set: TagSet) -> str:
    return join_values(get_tag_variants(tag_set))


def ensure_required_tag_sets(db: Session) -> list[TagSet]:
    """Crea Comida/Agua/Pis/Caca si faltan. No sobrescribe variantes existentes."""
    existing = {
        t.name.casefold(): t
        for t in db.query(TagSet).options(joinedload(TagSet.variants_rel)).all()
    }
    created = False
    for name, defaults in REQUIRED_TAG_SETS.items():
        if name.casefold() in existing:
            continue
        tag_set = TagSet(name=name)
        db.add(tag_set)
        db.flush()
        set_tag_variants(db, tag_set, defaults)
        existing[name.casefold()] = tag_set
        created = True
    if created:
        db.commit()
    return load_tag_sets(db)


def load_tag_sets(db: Session) -> list[TagSet]:
    sets = db.query(TagSet).options(joinedload(TagSet.variants_rel)).all()
    # Obligatorios primero, luego el resto por nombre
    required_order = {n.casefold(): i for i, n in enumerate(REQUIRED_TAG_SETS.keys())}

    def sort_key(t: TagSet):
        key = t.name.casefold()
        if key in required_order:
            return (0, required_order[key])
        return (1, key)

    return sorted(sets, key=sort_key)


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
        "is_required": is_required_tag_set(tag_set.name),
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
