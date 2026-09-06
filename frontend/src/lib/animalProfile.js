import { formatWeightKg } from './eventColors';

export const SPECIES_INFO = {
  1: { name: 'Perros', emoji: '🐶' },
  2: { name: 'Gatos', emoji: '🐱' },
  3: { name: 'Loros', emoji: '🦜' },
  4: { name: 'Conejos', emoji: '🐰' },
  5: { name: 'Tortugas', emoji: '🐢' },
  6: { name: 'Erizos', emoji: '🦔' },
};

export const TRAIT_OPTIONS = [
  { key: 'is_blind', label: 'Ciego' },
  { key: 'is_deaf', label: 'Sordo' },
  { key: 'no_smell', label: 'Sin olfato' },
  { key: 'has_neurological', label: 'Temas neurológicos' },
  { key: 'has_involuntary_movements', label: 'Movimientos involuntarios' },
];

/** Datos de cuidado que suelen venir del formulario de ingreso. */
export const CARE_OPTIONS = [
  { key: 'is_escapist', label: 'Escapista', important: true },
  { key: 'has_attachment_issues', label: 'Problemas de apego', important: true },
  { key: 'aversive_to_people', label: 'Aversivo a la gente', important: true },
  { key: 'aversive_to_dogs', label: 'Aversivo a los perros', important: true },
  { key: 'has_bitten_people', label: 'Mordió personas', important: true },
  { key: 'has_bitten_dogs', label: 'Mordió perros', important: true },
  { key: 'bites_often', label: 'Muerde seguido', important: true },
  { key: 'needs_medication', label: 'Requiere medicación', important: true },
  { key: 'needs_diapers', label: 'Pañales', important: true },
  { key: 'needs_isolation', label: 'Aislamiento', important: true },
  { key: 'needs_muzzle', label: 'Bozal', important: true },
  { key: 'has_special_diet', label: 'Dieta especial', important: true },
  { key: 'destroys_things', label: 'Rompe cosas', important: true },
];

export const HOUSING_OPTIONS = [
  { value: '', label: 'Sin dato' },
  { value: 'house', label: 'Casa' },
  { value: 'apartment', label: 'Departamento' },
];

export const FAMILIAR_ANIMAL_OPTIONS = [
  { key: 'gatos', label: 'Gatos' },
  { key: 'conejos', label: 'Conejos' },
  { key: 'tortugas', label: 'Tortugas' },
  { key: 'erizos', label: 'Erizos' },
  { key: 'loros', label: 'Loros' },
  { key: 'cobayos', label: 'Cobayos' },
];

export const INTAKE_TEXT_FIELDS = [
  'housing_type', 'familiar_with_animals', 'fears', 'destroys_what',
  'food_brand', 'food_amount', 'food_times_per_day', 'special_diet_details',
  'intake_vaccines', 'intake_medication', 'allergies', 'health_issues',
  'contact_name', 'contact_phone', 'contact_email', 'contact_notes',
];

export const INTAKE_BOOL_DEFAULTS = {
  aversive_to_people: false,
  aversive_to_dogs: false,
  has_bitten_people: false,
  has_bitten_dogs: false,
  bites_often: false,
  lives_with_dogs: false,
  plays_with_dogs: false,
  destroys_things: false,
  likes_water: false,
  likes_pool: false,
  intake_dewormed_internal: false,
  intake_dewormed_external: false,
  walks_outside_neighborhood: false,
};

export function parseFamiliarList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

export function joinFamiliarList(list) {
  return (list || []).filter(Boolean).join(',');
}

export function housingLabel(value) {
  return HOUSING_OPTIONS.find((o) => o.value === value)?.label || null;
}

export function familiarAnimalsLabel(value) {
  const keys = parseFamiliarList(value);
  if (!keys.length) return null;
  return keys
    .map((k) => FAMILIAR_ANIMAL_OPTIONS.find((o) => o.key === k)?.label || k)
    .join(', ');
}

export const DOG_SOCIABILITY_OPTIONS = [
  { value: '', label: 'Sin dato' },
  { value: 'good', label: 'Bien con otros perros' },
  { value: 'selective', label: 'Selectivo / depende' },
  { value: 'poor', label: 'No se lleva con otros perros' },
];

export function dogSociabilityLabel(value) {
  return DOG_SOCIABILITY_OPTIONS.find((o) => o.value === value)?.label || null;
}

export function careLabels(animal) {
  if (!animal) return [];
  return CARE_OPTIONS.filter((t) => animal[t.key]).map((t) => t.label);
}

export function sexLabel(sex) {
  if (sex === 'M') return 'Macho';
  if (sex === 'F') return 'Hembra';
  return null;
}

export function formatAge(animal) {
  if (!animal) return null;
  if (animal.is_rescue) {
    const min = animal.age_estimate_min;
    const max = animal.age_estimate_max;
    if (min != null && max != null) return `~${min}–${max} años`;
    if (min != null) return `desde ~${min} años`;
    if (max != null) return `hasta ~${max} años`;
    return null;
  }
  if (animal.age_years != null && animal.age_years !== '') return `${animal.age_years} años`;
  return null;
}

export function traitLabels(animal) {
  if (!animal) return [];
  return TRAIT_OPTIONS.filter((t) => animal[t.key]).map((t) => t.label);
}

export function speciesLabel(animal) {
  if (!animal) return null;
  return animal.species_name || SPECIES_INFO[animal.species_id]?.name || null;
}

export function breedLabel(animal) {
  if (!animal) return null;
  const name = animal.breed_name;
  if (name) return animal.is_simil_breed ? `SÍMIL ${name}` : name;
  if (animal.is_simil_breed) return 'SÍMIL raza';
  return null;
}

export function weightLabel(animal) {
  if (!animal || animal.weight_kg == null || animal.weight_kg === '') return null;
  return formatWeightKg(Number(animal.weight_kg));
}
