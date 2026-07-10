import { useState, useEffect } from 'react';
import CatalogCRUD from './CatalogCRUD';

export default function CatalogsPanel() {
  const [activeCatalog, setActiveCatalog] = useState('species');
  const [speciesList, setSpeciesList] = useState([]);

  // Fetch species only for the breeds dropdown
  useEffect(() => {
    fetch('/api/catalogs/species', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => setSpeciesList(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, []);

  const catalogs = [
    { id: 'species', label: 'Especies' },
    { id: 'breeds', label: 'Razas' },
    { id: 'laboratories', label: 'Laboratorios' },
    { id: 'vaccines', label: 'Vacunas' },
    { id: 'products', label: 'Productos Vet.' },
    { id: 'veterinarians', label: 'Veterinarios' },
    { id: 'tagsets', label: 'Diccionarios IA' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex gap-2 overflow-x-auto">
        {catalogs.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCatalog(c.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
              activeCatalog === c.id 
                ? 'bg-indigo-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div>
        {activeCatalog === 'species' && (
          <CatalogCRUD
            title="Especies"
            endpoint="/api/catalogs/species"
            columns={[{ key: 'name', label: 'Nombre' }]}
            formFields={[{ key: 'name', label: 'Nombre de Especie', required: true }]}
          />
        )}
        
        {activeCatalog === 'breeds' && (
          <CatalogCRUD
            title="Razas"
            endpoint="/api/catalogs/breeds"
            columns={[
              { key: 'name', label: 'Nombre' },
              { key: 'species_id', label: 'Especie', render: (val) => {
                const s = speciesList.find(x => x.id === val);
                return s ? s.name : val;
              }}
            ]}
            formFields={[
              { key: 'name', label: 'Nombre de Raza', required: true },
              { key: 'species_id', label: 'Especie', type: 'select', required: true, options: speciesList.map(s => ({ value: s.id, label: s.name })) }
            ]}
          />
        )}

        {activeCatalog === 'laboratories' && (
          <CatalogCRUD
            title="Catálogo de Laboratorios"
            endpoint="/api/catalogs/laboratories"
            columns={[{ key: 'name', label: 'Nombre' }]}
            formFields={[{ key: 'name', label: 'Nombre del Estudio', required: true }]}
          />
        )}

        {activeCatalog === 'vaccines' && (
          <CatalogCRUD
            title="Catálogo de Vacunas"
            endpoint="/api/catalogs/vaccines"
            columns={[{ key: 'name', label: 'Nombre' }]}
            formFields={[{ key: 'name', label: 'Nombre de Vacuna', required: true }]}
          />
        )}

        {activeCatalog === 'products' && (
          <CatalogCRUD
            title="Productos Veterinarios"
            endpoint="/api/catalogs/products"
            columns={[
              { key: 'name', label: 'Nombre' },
              { key: 'type', label: 'Tipo' }
            ]}
            formFields={[
              { key: 'name', label: 'Nombre', required: true },
              { key: 'type', label: 'Tipo', type: 'select', required: true, options: [
                { value: 'INTERNAL', label: 'Desparasitante Interno' },
                { value: 'EXTERNAL', label: 'Desparasitante Externo' }
              ]}
            ]}
          />
        )}

        {activeCatalog === 'veterinarians' && (
          <CatalogCRUD
            title="Veterinarios"
            endpoint="/api/catalogs/veterinarians"
            columns={[
              { key: 'name', label: 'Nombre' },
              { key: 'phone', label: 'Teléfono' },
              { key: 'email', label: 'Email' }
            ]}
            formFields={[
              { key: 'name', label: 'Nombre', required: true },
              { key: 'phone', label: 'Teléfono' },
              { key: 'email', label: 'Email' }
            ]}
          />
        )}

        {activeCatalog === 'tagsets' && (
          <CatalogCRUD
            title="Diccionarios IA (TagSets)"
            endpoint="/api/catalogs/tagsets"
            columns={[
              { key: 'name', label: 'Conjunto' },
              { key: 'variants_text', label: 'Variantes / Palabras clave' }
            ]}
            formFields={[
              { key: 'name', label: 'Nombre de Conjunto (Ej: Alerta Verde, Comida)', required: true },
              { key: 'variants', label: 'Variantes (separadas por coma)', required: true }
            ]}
          />
        )}
      </div>
    </div>
  );
}
