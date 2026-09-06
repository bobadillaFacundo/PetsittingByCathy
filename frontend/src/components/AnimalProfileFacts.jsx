import {
  breedLabel,
  careLabels,
  dogSociabilityLabel,
  familiarAnimalsLabel,
  formatAge,
  housingLabel,
  sexLabel,
  speciesLabel,
  traitLabels,
  weightLabel,
} from '../lib/animalProfile';

function Fact({ label, value }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function Chip({ label, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
  };
  return (
    <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full border ${tones[tone]}`}>
      {label}
    </span>
  );
}

function yesNo(value, yesLabel, noLabel = null) {
  if (value === true) return yesLabel;
  if (value === false && noLabel) return noLabel;
  return null;
}

function hasIntakeData(animal) {
  if (!animal) return false;
  if (careLabels(animal).length) return true;
  if (dogSociabilityLabel(animal.dog_sociability)) return true;
  if (housingLabel(animal.housing_type)) return true;
  if (familiarAnimalsLabel(animal.familiar_with_animals)) return true;
  const textKeys = [
    'fears', 'destroys_what', 'food_brand', 'food_amount', 'food_times_per_day',
    'special_diet_details', 'intake_vaccines', 'intake_medication', 'allergies',
    'health_issues', 'contact_name', 'contact_phone', 'contact_email', 'contact_notes',
    'care_notes',
  ];
  if (textKeys.some((k) => animal[k] && String(animal[k]).trim())) return true;
  return Boolean(
    animal.lives_with_dogs || animal.plays_with_dogs || animal.likes_water ||
    animal.likes_pool || animal.intake_dewormed_internal || animal.intake_dewormed_external ||
    animal.walks_outside_neighborhood || animal.destroys_things ||
    animal.has_bitten_people || animal.has_bitten_dogs || animal.bites_often
  );
}

export default function AnimalProfileFacts({ animal, compact = false }) {
  if (!animal) return null;

  const sex = sexLabel(animal.sex);
  const age = formatAge(animal);
  const species = speciesLabel(animal);
  const breed = breedLabel(animal);
  const weight = weightLabel(animal);
  const traits = traitLabels(animal);
  const cares = careLabels(animal);
  const sociability = dogSociabilityLabel(animal.dog_sociability);
  const housing = housingLabel(animal.housing_type);
  const familiar = familiarAnimalsLabel(animal.familiar_with_animals);
  const castrado = animal.is_castrated ? 'Castrado' : 'No castrado';
  const intakeReady = hasIntakeData(animal);
  const bites = [
    animal.has_bitten_people && 'personas',
    animal.has_bitten_dogs && 'perros',
  ].filter(Boolean);
  const biteText = bites.length
    ? `Mordió ${bites.join(' y ')}${animal.bites_often ? ' (seguido)' : ''}`
    : null;
  const foodParts = [
    animal.food_brand,
    animal.food_amount,
    animal.food_times_per_day ? `${animal.food_times_per_day} veces/día` : null,
  ].filter(Boolean);
  const contactParts = [
    animal.contact_name,
    animal.contact_phone,
    animal.contact_email,
  ].filter(Boolean);

  if (compact) {
    const chips = [
      sex,
      castrado,
      weight,
      age,
      housing,
      animal.is_rescue ? 'Rescate' : null,
      sociability,
      biteText,
      ...cares,
      animal.allergies ? 'Alérgico' : null,
      animal.walks_outside_neighborhood ? 'Paseo afuera del barrio' : null,
      ...traits,
    ].filter(Boolean);
    if (chips.length === 0 && !intakeReady) {
      return (
        <p className="text-[11px] text-amber-700 mt-2 font-medium">
          Ficha de ingreso sin completar
        </p>
      );
    }
    const important = new Set(cares);
    if (biteText) important.add(biteText);
    if (sociability && animal.dog_sociability === 'poor') important.add(sociability);
    if (animal.allergies) important.add('Alérgico');
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            tone={important.has(chip) ? 'amber' : traits.includes(chip) ? 'rose' : 'gray'}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Fact label="Especie" value={species} />
        <Fact label="Raza" value={breed} />
        <Fact label="Sexo" value={sex} />
        <Fact label="Castrado" value={castrado} />
        <Fact label="Peso" value={weight} />
        <Fact label="Edad" value={age} />
        <Fact label="Origen" value={animal.is_rescue ? 'Rescatado' : 'No rescatado'} />
        <Fact label="Pelaje" value={animal.coat_color} />
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
        <div>
          <h4 className="text-sm font-black text-amber-900">Formulario de ingreso</h4>
          <p className="text-xs text-amber-800 mt-0.5">
            Datos del Drive / ingreso del cliente
          </p>
        </div>
        {!intakeReady ? (
          <p className="text-sm text-amber-800 bg-white/70 border border-amber-100 rounded-xl px-3 py-2">
            Todavía no hay datos de ingreso cargados. El admin los completa en Mascotas → Básicos → Formulario de ingreso.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Fact label="Vive en" value={housing} />
              <Fact label="Con otros perros" value={sociability} />
              <Fact label="Convive con perros" value={
                animal.lives_with_dogs
                  ? (animal.lives_with_dogs_count ? `Sí, ${animal.lives_with_dogs_count}` : 'Sí')
                  : null
              } />
              <Fact label="Juega con perros" value={yesNo(animal.plays_with_dogs, 'Sí')} />
              <Fact label="Otros animales" value={familiar} />
              <Fact label="Agua / pileta" value={[
                animal.likes_water && 'Le gusta el agua',
                animal.likes_pool && 'Se mete a la pileta',
              ].filter(Boolean).join(' · ') || null} />
              <Fact label="Paseos" value={
                animal.walks_outside_neighborhood
                  ? 'Autoriza pasear por los alrededores'
                  : null
              } />
              <Fact label="Alimento" value={foodParts.join(' · ') || null} />
              <Fact label="Vacunas (ingreso)" value={animal.intake_vaccines} />
              <Fact label="Desparasitado" value={[
                animal.intake_dewormed_internal && 'Interna',
                animal.intake_dewormed_external && 'Externa',
              ].filter(Boolean).join(' y ') || null} />
              <Fact label="Remedios" value={animal.intake_medication} />
              <Fact label="Alergias" value={animal.allergies} />
              <Fact label="Salud" value={animal.health_issues} />
              <Fact label="Miedos" value={animal.fears} />
              <Fact label="Rompe" value={animal.destroys_things ? (animal.destroys_what || 'Sí') : null} />
              <Fact label="Dieta especial" value={animal.special_diet_details} />
              <Fact label="Contacto" value={contactParts.join(' · ') || null} />
            </div>
            {(cares.length > 0 || biteText) && (
              <div className="flex flex-wrap gap-1.5">
                {biteText && <Chip label={biteText} tone="amber" />}
                {cares.map((label) => (
                  <Chip key={label} label={label} tone="amber" />
                ))}
              </div>
            )}
            {animal.contact_notes?.trim() && (
              <Fact label="Notas de contacto" value={animal.contact_notes.trim()} />
            )}
            {animal.care_notes?.trim() && (
              <div className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Notas de cuidado</p>
                <p className="text-sm text-amber-950 whitespace-pre-wrap">{animal.care_notes.trim()}</p>
              </div>
            )}
          </>
        )}
      </div>

      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {traits.map((label) => (
            <Chip key={label} label={label} tone="rose" />
          ))}
        </div>
      )}
    </div>
  );
}
