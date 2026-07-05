import VoiceRecorder from './components/VoiceRecorder';
import SmartSearch from './components/SmartSearch';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <nav className="bg-white shadow-sm px-8 py-4 mb-8 sticky top-0 z-10">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight">
          🐾 Asistente Veterinario
        </h1>
      </nav>
      <main className="px-4 pb-12 max-w-6xl mx-auto space-y-12">
        <section>
          <SmartSearch />
        </section>
        
        <section className="flex justify-center">
          <VoiceRecorder />
        </section>

        <section>
          <Dashboard />
        </section>
      </main>
    </div>
  );
}

export default App;
