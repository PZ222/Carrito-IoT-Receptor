// === CONFIG ===
const API_BASE = "http://3.225.81.202:5500";
const API = `${API_BASE}/api`;
const WS  = `ws://3.225.81.202:5500/ws`;

const els = {
  apiBadge: document.getElementById("apiBadge"),
  deviceId: document.getElementById("deviceId"),
  refresh:  document.getElementById("refreshBtn"),
  wsBadge:  document.getElementById("wsBadge"),
  status:   document.getElementById("statusText"),
  lastMove: document.getElementById("lastMove"),
  lastObs:  document.getElementById("lastObs"),
  moves:    document.getElementById("movesList"),
  obs:      document.getElementById("obsList"),
};

function setStatus(t){ if (els.status) els.status.textContent = t; }

// Timestamps "YYYY-MM-DD HH:MM:SS" -> local
function fmtTs(ts){
  if (!ts) return "—";
  try {
    const d = new Date(String(ts).replace(" ", "T"));
    return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
  } catch { return String(ts); }
}

// --------- extraer velocidad desde parametros_json ----------
function extraerVelocidad(row){
  const p = row && row.parametros_json;
  if (!p) return null;

  let vel = null;

  // Caso 1: viene como objeto JSON
  if (typeof p === "object") {
    vel = p.velocidad;
  }
  // Caso 2: viene como string JSON
  else if (typeof p === "string") {
    try {
      const pj = JSON.parse(p);
      vel = pj.velocidad;
    } catch {
      // ignoramos errores de parseo
    }
  }

  if (typeof vel === "number") return vel;
  if (typeof vel === "string") {
    const v = Number(vel);
    if (!Number.isNaN(v)) return v;
  }
  return null;
}
// -----------------------------------------------------------

// fetch con CORS y tolerante al formato
async function fetchJson(url){
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;          // array crudo
  if (data && data.ok) return data.data || [];   // { ok, data }
  return data;                                   // fallback
}

// PING a /api/health (para mostrar chip de estado)
async function pingAPI(){
  if (!els.apiBadge) return;
  try {
    const res = await fetch(`${API_BASE}/api/health`, { mode: "cors" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    els.apiBadge.classList.remove("chip-err");
    els.apiBadge.classList.add("chip-ok");
    els.apiBadge.textContent = `API OK: ${API_BASE}`;
  } catch (e){
    els.apiBadge.classList.remove("chip-ok");
    els.apiBadge.classList.add("chip-err");
    els.apiBadge.textContent = `API ERROR: ${e.message}`;
  }
}

function renderLastMove(row){
  if (!row){
    els.lastMove.classList.add("empty");
    els.lastMove.textContent="—";
    return;
  }
  els.lastMove.classList.remove("empty");

  const vel = extraerVelocidad(row);
  const velTxt = vel != null ? `${vel}` : "—";

  els.lastMove.innerHTML = `
    <div class="row"><span class="key">Movimiento</span><span class="value">${row.mov_desc || row.mov_clave || row.id_mov || "—"}</span></div>
    <div class="row"><span class="key">Origen</span><span>${row.origen ?? "—"}</span></div>
    <div class="row"><span class="key">Resultado</span><span>${row.resultado ?? "—"}</span></div>
    <div class="row"><span class="key">Velocidad</span><span>${velTxt}</span></div>
    <div class="row"><span class="key">Fecha</span><span>${fmtTs(row.ts)}</span></div>
  `;
}

function renderLastObs(row){
  if (!row){
    els.lastObs.classList.add("empty");
    els.lastObs.textContent="—";
    return;
  }
  els.lastObs.classList.remove("empty");
  els.lastObs.innerHTML = `
    <div class="row"><span class="key">Obstáculo</span><span class="value">${row.obs_desc || row.obs_clave || row.id_obs || "—"}</span></div>
    <div class="row"><span class="key">Distancia</span><span>${row.distancia_cm ?? "—"} cm</span></div>
    <div class="row"><span class="key">Lado</span><span>${row.lado ?? "—"}</span></div>
    <div class="row"><span class="key">Fecha</span><span>${fmtTs(row.ts)}</span></div>
  `;
}

function renderListMoves(rows){
  els.moves.innerHTML = (rows && rows.length ? rows : []).map(r => {
    const vel = extraerVelocidad(r);
    const velTxt = vel != null ? `${vel}` : "—";
    return `
      <div class="item">
        <div>${fmtTs(r.ts)}</div>
        <div>${r.mov_desc || r.mov_clave || r.id_mov || "—"}</div>
        <div>Origen: ${r.origen ?? "—"} • Res: ${r.resultado ?? "—"}</div>
        <div>Modelo: ${r.clave_modelo ?? "—"} • Vel: ${velTxt}</div>
      </div>
    `;
  }).join("") || `<div class="card empty">Sin datos</div>`;
}

function renderListObs(rows){
  els.obs.innerHTML = (rows && rows.length ? rows : []).map(r => `
    <div class="item">
      <div>${fmtTs(r.ts)}</div>
      <div>${r.obs_desc || r.obs_clave || r.id_obs || "—"}</div>
      <div>Dist: ${r.distancia_cm ?? "—"} cm • Lado: ${r.lado ?? "—"}</div>
      <div>Modelo: ${r.clave_modelo ?? "—"}</div>
    </div>
  `).join("") || `<div class="card empty">Sin datos</div>`;
}

async function loadData(){
  const id = Number(els.deviceId?.value || 1);
  setStatus("Cargando…");
  try{
    const [moves10, obs10] = await Promise.all([
      fetchJson(`${API}/movimientos?id_dispositivo=${id}&limit=10`),
      fetchJson(`${API}/obstaculos?id_dispositivo=${id}&limit=10`)
    ]);
    renderLastMove(moves10?.[0]);
    renderLastObs(obs10?.[0]);
    renderListMoves(moves10);
    renderListObs(obs10);
    setStatus("Listo");
  }catch(e){
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

// WebSocket: dispara refresh en “movimiento” u “obstaculo”
function initWS(){
  try{
    const ws = new WebSocket(WS);
    ws.onopen = () => els.wsBadge && (els.wsBadge.textContent = "WS: conectado");
    ws.onclose = () => els.wsBadge && (els.wsBadge.textContent = "WS: desconectado");
    ws.onerror = () => els.wsBadge && (els.wsBadge.textContent = "WS: error");
    ws.onmessage = (ev) => {
      try{
        const msg = JSON.parse(ev.data);
        if (msg?.type === "movimiento" || msg?.type === "obstaculo") {
          loadData();
        }
      }catch{/* ignore */}
    };
  }catch{/* ignore */}
}

// Eventos manuales opcionales
els.refresh?.addEventListener("click", loadData);
els.deviceId?.addEventListener("change", loadData);

// Arranque
pingAPI();
initWS();
loadData();
