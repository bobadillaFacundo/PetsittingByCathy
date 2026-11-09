import { useEffect, useState } from 'react';
import { Cpu, RefreshCw, AlertCircle, Wallet } from 'lucide-react';
import { API_BASE } from '../../lib/api';

function formatTokens(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-AR');
}

function StatCard({ label, stats }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-gray-900">{formatTokens(stats?.total_tokens)}</p>
      <p className="text-xs text-gray-500 mt-1">
        {formatTokens(stats?.calls)} llamadas · {formatTokens(stats?.prompt_tokens)} in /{' '}
        {formatTokens(stats?.completion_tokens)} out
      </p>
    </div>
  );
}

export default function ConsumoIAPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  const fetchUsage = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/dashboard/ai-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'No se pudo cargar el consumo de IA');
      }
      setData(await res.json());
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al cargar consumo de IA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const balance = data?.deepseek_balance;
  const primaryBalance = balance?.balances?.[0];

  return (
    <div className="pet-panel overflow-hidden animate-fade-in-up">
      <div className="pet-panel-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 shrink-0">
            <Cpu size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-800">Consumo de IA</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Saldo DeepSeek y tokens gastados por reportes, historias y análisis.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchUsage}
          disabled={loading}
          className="pet-btn pet-btn--secondary px-4 py-2 text-sm shrink-0"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="pet-panel-body space-y-6">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <RefreshCw size={32} className="animate-spin mb-4 text-indigo-300" />
            <p className="font-medium text-sm">Consultando saldo y consumo…</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 font-medium border border-red-100">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-white text-indigo-600 shadow-sm">
                  <Wallet size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-indigo-950">Saldo DeepSeek</h3>
                  {!balance?.configured ? (
                    <p className="text-sm text-indigo-800 mt-1">
                      No hay `DEEPSEEK_API_KEY` configurada.
                    </p>
                  ) : balance?.error ? (
                    <p className="text-sm text-red-700 mt-1">{balance.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-indigo-800 mt-1">
                        Cuenta {balance.is_available ? 'disponible' : 'sin saldo / no disponible'}
                        {primaryBalance?.currency ? ` · ${primaryBalance.currency}` : ''}
                      </p>
                      {primaryBalance ? (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-white/80 rounded-xl p-3 border border-indigo-100">
                            <p className="text-[11px] font-bold uppercase text-gray-500">Total</p>
                            <p className="text-xl font-black text-gray-900">
                              {primaryBalance.total_balance}
                            </p>
                          </div>
                          <div className="bg-white/80 rounded-xl p-3 border border-indigo-100">
                            <p className="text-[11px] font-bold uppercase text-gray-500">Otorgado</p>
                            <p className="text-lg font-bold text-gray-800">
                              {primaryBalance.granted_balance}
                            </p>
                          </div>
                          <div className="bg-white/80 rounded-xl p-3 border border-indigo-100">
                            <p className="text-[11px] font-bold uppercase text-gray-500">Recargado</p>
                            <p className="text-lg font-bold text-gray-800">
                              {primaryBalance.topped_up_balance}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-indigo-800 mt-1">Sin detalle de balances.</p>
                      )}
                      {balance.raw_checked_at && (
                        <p className="text-[11px] text-indigo-700/70 mt-2">
                          Consulta: {balance.raw_checked_at}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-800 mb-3">Tokens registrados en la app</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard label="Hoy" stats={data?.totals?.today} />
                <StatCard label="7 días" stats={data?.totals?.week} />
                <StatCard label="30 días" stats={data?.totals?.month} />
                <StatCard label="Histórico" stats={data?.totals?.all} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                El saldo DeepSeek baja en la cuenta; los tokens de abajo se acumulan desde que
                activamos el registro de consumo en esta app.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h4 className="font-bold text-gray-800 mb-3">Por proveedor (30 días)</h4>
                {(data?.by_provider_month || []).length === 0 ? (
                  <p className="text-sm text-gray-400">Todavía no hay consumo registrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.by_provider_month.map((row) => (
                      <li
                        key={row.provider}
                        className="flex items-center justify-between text-sm border-b border-gray-50 pb-2"
                      >
                        <span className="font-semibold text-gray-800 capitalize">{row.provider}</span>
                        <span className="text-gray-600">
                          {formatTokens(row.total_tokens)} tok · {formatTokens(row.calls)} calls
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h4 className="font-bold text-gray-800 mb-3">Por uso (30 días)</h4>
                {(data?.by_purpose_month || []).length === 0 ? (
                  <p className="text-sm text-gray-400">Todavía no hay consumo registrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.by_purpose_month.map((row) => (
                      <li
                        key={row.purpose}
                        className="flex items-center justify-between text-sm border-b border-gray-50 pb-2"
                      >
                        <span className="font-semibold text-gray-800">{row.purpose}</span>
                        <span className="text-gray-600">
                          {formatTokens(row.total_tokens)} tok · {formatTokens(row.calls)} calls
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h4 className="font-bold text-gray-800">Últimas llamadas</h4>
              </div>
              {(data?.recent || []).length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Sin registros todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500">
                        <th className="px-4 py-2 font-bold">Fecha</th>
                        <th className="px-4 py-2 font-bold">Prov.</th>
                        <th className="px-4 py-2 font-bold">Uso</th>
                        <th className="px-4 py-2 font-bold">Modelo</th>
                        <th className="px-4 py-2 font-bold text-right">Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row) => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString('es-AR')
                              : '—'}
                          </td>
                          <td className="px-4 py-2 capitalize font-medium text-gray-800">
                            {row.provider}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{row.purpose || 'nlp'}</td>
                          <td className="px-4 py-2 text-gray-500 truncate max-w-[10rem]">
                            {row.model || '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-900">
                            {formatTokens(row.total_tokens)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
