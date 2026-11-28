// ==== CORE START
const ANALYSIS_SR = 22050, HOP_SEC = 0.005, FRAME_N = 512, NB = 16;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : 0;
}
const _fftCache = {};
function getFFT(N) {
  if (_fftCache[N]) return _fftCache[N];
  const cos = new Float64Array(N / 2), sin = new Float64Array(N / 2), rev = new Uint32Array(N), bits = Math.log2(N);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const fft = (re, im) => {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size *= 2) {
      const half = size / 2, step = N / size;
      for (let i = 0; i < N; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) {
        const l = j + half, tre = re[l] * cos[k] + im[l] * sin[k], tim = -re[l] * sin[k] + im[l] * cos[k];
        re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
      }
    }
  };
  return (_fftCache[N] = { fft, win });
}
function bandEdges(sr) {
  const fmin = 100, fmax = Math.min(8000, sr / 2 * 0.95), e = [];
  for (let b = 0; b <= NB; b++) e.push(Math.round(fmin * Math.pow(fmax / fmin, b / NB) / (sr / FRAME_N)));
  for (let b = 1; b <= NB; b++) if (e[b] <= e[b - 1]) e[b] = e[b - 1] + 1;
  return e;
}
function analyzeFrames(x, sr) {
  const hop = Math.max(1, Math.round(sr * HOP_SEC));
  const n = x.length >= FRAME_N ? Math.floor((x.length - FRAME_N) / hop) + 1 : 0;
  const rms = new Float32Array(n), bands = new Float32Array(n * NB);
  const { fft, win } = getFFT(FRAME_N), edges = bandEdges(sr), re = new Float64Array(FRAME_N), im = new Float64Array(FRAME_N);
  for (let i = 0; i < n; i++) {
    const o = i * hop; let s = 0;
    for (let k = 0; k < FRAME_N; k++) { const v = x[o + k]; s += v * v; re[k] = v * win[k]; im[k] = 0; }
    rms[i] = Math.sqrt(s / FRAME_N); fft(re, im);
    for (let b = 0; b < NB; b++) { let p = 0; for (let k = edges[b]; k < edges[b + 1]; k++) p += re[k] * re[k] + im[k] * im[k]; bands[i * NB + b] = p / (edges[b + 1] - edges[b]); }
  }
  return { rms, bands, hop, n, sr, dt: hop / sr, t0: FRAME_N / 2 / sr };
}
const toDb = (r) => 20 * Math.log10(r + 1e-6);
function noiseProfile(fr, mask) {
  const out = new Float64Array(NB); let c = 0;
  for (let i = 0; i < fr.n; i++) if (mask[i]) { c++; for (let b = 0; b < NB; b++) out[b] += fr.bands[i * NB + b]; }
  if (!c) { out.fill(1e-12); return Array.from(out); }
  for (let b = 0; b < NB; b++) out[b] = Math.max(out[b] / c, 1e-12);
  return Array.from(out);
}
function median(a) { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[s.length >> 1]; }


// stimmhafte Rahmen (Selbstähnlichkeit im Grundtonbereich): Vokale, m, n, l … = ja; ch, s, sch, f, Verschlusslaute = nein
function voicedFlags(x, fr, env, floorDb, S, minAbove, i0, i1) {
  const n = fr.n, hop = fr.hop, lagMin = Math.floor(fr.sr / S.PITCH_MAX_HZ), lagMax = Math.ceil(fr.sr / S.PITCH_MIN_HZ), W = FRAME_N - lagMax, v = new Uint8Array(n);
  const above = minAbove != null ? minAbove : S.ONSET_ABOVE_FLOOR_DB;
  for (let i = i0 || 0; i < (i1 != null ? Math.min(n, i1) : n); i += 2) {
    if (env[i] < floorDb + above) continue;
    const o = i * hop; let e0 = 0; for (let k = 0; k < W; k++) e0 += x[o + k] * x[o + k];
    let best = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let c = 0, e1 = 0; for (let k = 0; k < W; k++) { const b = x[o + k + lag]; c += x[o + k] * b; e1 += b * b; }
      const r = c / Math.sqrt(e0 * e1 + 1e-12); if (r > best) best = r;
    }
    v[i] = best >= S.VOICED_MIN_R ? 1 : 0; if (i + 1 < n) v[i + 1] = v[i];
  }
  return v;
}


// Grundfrequenz nach dem YIN-Verfahren (de Cheveigné & Kawahara): robust gegen Oktavfehler
function yinPitch(x, i0, sr, S) {
  const lagMin = Math.floor(sr / S.PITCH_MAX_HZ), lagMax = Math.ceil(sr / S.PITCH_MIN_HZ), W = 640;
  if (i0 < 0 || i0 + W + lagMax >= x.length) return 0;
  const d = new Float32Array(lagMax + 1);
  for (let tau = 1; tau <= lagMax; tau++) { let a = 0; for (let j = 0; j < W; j++) { const df = x[i0 + j] - x[i0 + j + tau]; a += df * df; } d[tau] = a; }
  const dn = new Float32Array(lagMax + 1); let run = 0; dn[0] = 1;
  for (let tau = 1; tau <= lagMax; tau++) { run += d[tau]; dn[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
  let tau = -1;
  for (let t = lagMin; t <= lagMax; t++) { if (dn[t] < S.YIN_THRESHOLD) { while (t + 1 <= lagMax && dn[t + 1] < dn[t]) t++; tau = t; break; } }
  if (tau < 0) return 0;
  const a = dn[tau - 1], b = dn[tau], c = dn[Math.min(lagMax, tau + 1)], den = a - 2 * b + c, off = den !== 0 ? 0.5 * (a - c) / den : 0;
  return sr / (tau + off);
}

// Messung einer Aufnahme (oder eines Referenz-Abschnitts)
function analyzeTake(x, sr, S, ref) {   // ref: optional die ersten 0,5 s der Aufnahme (nur Raumgeräusch) als Bezug für das Grundrauschen
  const fr = analyzeFrames(x, sr), n = fr.n;
  if (n < 20) return { valid: false, reason: 'short' };
  const env = new Float32Array(n); for (let i = 0; i < n; i++) env[i] = toDb(fr.rms[i]);
  const peakDb = percentile(env, 99.5);
  let floorDb = percentile(env, 5), noise = null, floorFromRef = false;
  if (ref && ref.length >= FRAME_N * 3) {                       // Grundrauschen aus den ersten 0,5 s, falls dort wirklich nur Rauschen ist
    const fr2 = analyzeFrames(ref, sr), e2 = Array.from(fr2.rms, toDb), fRef = median(e2);
    if (fRef <= percentile(env, 20) + 3) { floorDb = fRef; noise = noiseProfile(fr2, e2.map(() => true)); floorFromRef = true; }
  }
  if (!noise) noise = noiseProfile(fr, Array.from(env, (v) => v <= floorDb + 6));
  const snr = peakDb - floorDb;
  const base = { floorDb, peakDb, snr, floorFromRef, dur: x.length / sr };
  if (snr < S.MIN_SNR_DB) return { valid: false, reason: 'quiet', ...base };
  const frames = (sec) => Math.round(sec / fr.dt), tOf = (i) => fr.t0 + i * fr.dt;

  // Stimme von … bis …
  const thrOn = Math.min(floorDb + S.ONSET_ABOVE_FLOOR_DB, peakDb - 6), hold = Math.max(1, frames(S.ONSET_HOLD_SEC));
  let iOn = -1, iOff = -1, run = 0;
  for (let i = 0; i < n; i++) { run = env[i] >= thrOn ? run + 1 : 0; if (run >= hold) { iOn = i - hold + 1; break; } }
  run = 0;
  for (let i = n - 1; i >= 0; i--) { run = env[i] >= thrOn ? run + 1 : 0; if (run >= hold) { iOff = i + hold - 1; break; } }
  if (iOn < 0 || iOff <= iOn) return { valid: false, reason: 'novoice', ...base };

  // Pausen mitten im Wort
  const breaks = []; run = 0;
  for (let i = iOn; i <= iOff; i++) {
    if (env[i] < floorDb + S.BREAK_ABOVE_FLOOR_DB) run++; else { if (run >= frames(S.BREAK_SEC)) breaks.push([tOf(i - run), tOf(i)]); run = 0; }
  }

  // Änderungsgeschwindigkeit des Klangs (dB pro Sekunde): gedehnt = langsam, normal gesprochen = schnell
  const pv = new Float64Array(NB);
  for (let i = iOn; i <= iOff; i++) for (let b = 0; b < NB; b++) pv[b] += fr.bands[i * NB + b] / (iOff - iOn + 1);
  let use = []; for (let b = 0; b < NB; b++) if (pv[b] >= S.BAND_MIN_SNR * noise[b]) use.push(b);
  if (use.length < 4) use = Array.from({ length: NB }, (_, b) => b);
  const lv = new Float32Array(n * NB);
  for (let i = 0; i < n; i++) for (const b of use) lv[i * NB + b] = 10 * Math.log10(Math.max(fr.bands[i * NB + b] - noise[b], 0.3 * noise[b]) + 1e-20);
  // nur die Klangfarbe zählt: Gesamtlautstärke je Rahmen abziehen (ein absichtlich ansteigender weicher Einsatz ist keine Klangänderung)
  for (let i = 0; i < n; i++) { let m = 0; for (const b of use) m += lv[i * NB + b]; m /= use.length; for (const b of use) lv[i * NB + b] -= m; }
  const lvMean = (i, b) => { let s = 0, c = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) { s += lv[k * NB + b]; c++; } return s / c; };
  const Dl = frames(S.FLUX_SPAN_SEC), flux = new Float32Array(n);
  for (let i = Dl; i < n - Dl; i++) { let a = 0; for (const b of use) { const d = lvMean(i + Dl, b) - lvMean(i - Dl, b); a += d * d; } flux[i] = Math.sqrt(a / use.length) / (2 * Dl * fr.dt); }
  const hw = frames(S.FLUX_MEDIAN_SEC) >> 1, fluxMed = new Float32Array(n);
  for (let i = 0; i < n; i++) fluxMed[i] = median(flux.subarray(Math.max(0, i - hw), Math.min(n, i + hw + 1)));

  // gedehnte Stelle: zusammenhängende Bereiche, in denen sich der Klang nur langsam ändert (Lücken bis FLUX_GAP_SEC
  // werden überbrückt, z. B. Verschlusslaute). Alles davor (Anfangsmitlaute, Übergänge) gehört zur ersten Silbe.
  const gapMax = frames(S.FLUX_GAP_SEC), runMin = frames(S.SLOW_RUN_MIN_SEC), runs = [];
  let rs = -1, lastSlow = -1;
  for (let j = iOn; j <= iOff + 1; j++) {
    const slow = j <= iOff && fluxMed[j] < S.SLOW_FLUX_MAX;
    if (slow) { if (rs < 0) rs = j; lastSlow = j; }
    else if (rs >= 0 && (j > iOff || j - lastSlow > gapMax)) { if (lastSlow - rs + 1 >= runMin) runs.push([rs, lastSlow]); rs = -1; }
  }
  const longRuns = runs.filter((r) => r[1] - r[0] + 1 >= frames(S.SLOW_RUN_LONG_SEC));
  let iSlowEnd = iOn;
  if (longRuns.length) iSlowEnd = longRuns[longRuns.length - 1][1];
  else if (runs.length) iSlowEnd = runs.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m))[1];
  iSlowEnd = clamp(iSlowEnd, iOn, iOff);
  const slowRuns = runs.map((r) => [tOf(r[0]), tOf(r[1])]);

  // Einsatz: Anstiegszeit (10→90 %) und Anfangsspitze
  const A = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) { s += fr.rms[k]; c++; } A[i] = s / c; }
  const iStart = Math.max(0, iOn - frames(0.1)), lowAbs = Math.pow(10, floorDb / 20) * 1.5;
  const w = clamp(iSlowEnd - iOn, frames(0.15), frames(S.ATTACK_WINDOW_SEC)), iA = Math.min(iOff, iOn + w), iB = Math.min(iA, iOn + (w >> 1));
  let L = 0; for (let i = iB; i <= iA; i++) L += A[i] / (iA - iB + 1);
  let i90 = iA; for (let i = iStart; i <= iA; i++) if (A[i] >= S.RISE_HIGH * L) { i90 = i; break; }
  const low = Math.min(Math.max(S.RISE_LOW * L, lowAbs), 0.5 * L);
  let i10 = i90; while (i10 > iStart && A[i10] > low) i10--;
  const pk = (a, b) => { let m = -Infinity; for (let i = a; i <= Math.min(b, n - 1); i++) m = Math.max(m, env[i]); return m; };
  const later = []; for (let i = iOn + frames(0.4); i <= Math.min(iSlowEnd, iOn + frames(1.0)); i++) later.push(env[i]);
  const overshoot = later.length > 10 ? pk(iOn, iOn + frames(0.15)) - median(later) : null;

  // Lautstärkeverlauf nur über die stimmhaften Laute (Endlaute wie ch, s, t sind von Natur aus leiser und zählen nicht)
  const voiced = voicedFlags(x, fr, env, floorDb, S), gapV = frames(S.VOICED_GAP_SEC);
  let vS = -1, vE = -1; for (let i = iOn; i <= iOff; i++) if (voiced[i]) { vS = i; break; } for (let i = iOff; i >= iOn; i--) if (voiced[i]) { vE = i; break; }
  const vIdx = []; { let last = -1; for (let i = vS; i >= 0 && i <= vE; i++) if (voiced[i]) { if (last >= 0 && i - last > 1 && i - last - 1 <= gapV) for (let k = last + 1; k < i; k++) vIdx.push(k); vIdx.push(i); last = i; } }
  const envS = new Float32Array(n); for (let i = 0; i < n; i++) { let s2 = 0, c2 = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { s2 += env[k]; c2++; } envS[i] = s2 / c2; }
  let profile = null;
  if (vIdx.length >= frames(S.VOICED_MIN_SEC)) {
    // Kern = stimmhafte Rahmen zwischen dem ersten und letzten Rahmen, der höchstens PROFILE_TRIM_DB unter dem Spitzenwert liegt
    const lv = vIdx.map((i) => envS[i]), peakV = percentile(lv, 90);
    let k0 = 0, k1 = vIdx.length - 1; while (k0 < k1 && lv[k0] < peakV - S.PROFILE_TRIM_DB) k0++; while (k1 > k0 && lv[k1] < peakV - S.PROFILE_TRIM_DB) k1--;
    const core = vIdx.slice(k0, k1 + 1).filter((i) => i <= iSlowEnd), m = core.length;   // nur die gedehnte Stelle (der normal gesprochene Rest hat eigene Lautstärke und Tonhöhe)
    if (m >= frames(S.VOICED_MIN_SEC)) {
      const take = (a, b) => core.slice(Math.floor(a), Math.max(Math.floor(a) + 1, Math.floor(b))).map((i) => envS[i]);
      const nStart = Math.min(m >> 1, frames(0.15)), nEnd = Math.max(Math.min(m >> 1, frames(0.2)), Math.floor(m * 0.2));
      const startL = median(take(0, nStart)), plateau = median(take(m * 0.3, m * 0.8)), endL = median(take(m - nEnd, m));
      let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let k = 0; k < m; k++) { const t = k * fr.dt, y = envS[core[k]]; sx += t; sy += y; sxx += t * t; sxy += t * y; }
      const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx + 1e-12);
      const hw2 = frames(0.05), lvC = core.map((i) => envS[i]); let maxDrop = 0, runMax = -Infinity;
      for (let k = Math.floor(m * 0.1); k < m; k++) { const md = median(lvC.slice(Math.max(0, k - hw2), Math.min(m, k + hw2 + 1))); runMax = Math.max(runMax, md); maxDrop = Math.max(maxDrop, runMax - md); }

      // Tonhöhe (Stimmlage) im Kern: Sprünge, Wackeln, Absinken; Stimmabbrüche; Ruckeln der Lautstärke
      const fr10 = []; for (let k = 0; k < m; k += 2) { const i = core[k], f = yinPitch(x, i * fr.hop, fr.sr, S); fr10.push({ i, f }); }
      const ok = fr10.filter((o) => o.f > 0), fmed = ok.length ? median(ok.map((o) => o.f)) : 0;
      let pitch = null;
      if (ok.length >= 0.6 * fr10.length && ok.length >= 20) {
        const st = fr10.map((o) => (o.f > 0 ? 12 * Math.log2(o.f / fmed) : null)), sm = st.map((v, k) => { const w = st.slice(Math.max(0, k - 1), k + 2).filter((q) => q != null); return w.length ? median(w) : null; });
        // Tonsprünge: Die Tonhöhe der nächsten 50 ms liegt dauerhaft mehr als PITCH_STEP_ST Halbtöne neben der der letzten 50 ms
        let jumps = 0; const jumpAts = []; const vv = sm.map((v) => (v == null ? NaN : v));
        const kEnd = vv.length - Math.round(S.PITCH_SKIP_END_SEC / 0.01);   // Anfang und Übergang zur nächsten Silbe auslassen
        for (let k = Math.max(5, Math.round(S.PITCH_SKIP_SEC / 0.01)); k + 5 <= kEnd; k++) { const A5 = vv.slice(k - 5, k).filter((q) => !isNaN(q)), B5 = vv.slice(k, k + 5).filter((q) => !isNaN(q)); if (A5.length >= 3 && B5.length >= 3 && Math.abs(median(B5) - median(A5)) > S.PITCH_STEP_ST) { jumps++; jumpAts.push(tOf(fr10[Math.min(k, fr10.length - 1)].i)); k += 10; } }
        const dev = []; const hwp = 15; for (let k = 0; k < sm.length; k++) { if (sm[k] == null) continue; const w = sm.slice(Math.max(0, k - hwp), k + hwp + 1).filter((q) => q != null); dev.push(Math.abs(sm[k] - median(w))); }
        const seg = (a, b) => { const q = sm.slice(Math.floor(a), Math.max(Math.floor(a) + 1, Math.floor(b))).filter((v) => v != null); return q.length ? median(q) : null; };
        const nn = sm.length, e0 = seg(nn * 0.3, nn * 0.8), e1 = seg(nn * 0.8, nn), s0 = seg(0, nn * 0.2), d1 = seg(nn * 0.85, nn), d0 = seg(nn * 0.1, nn * 0.35);
        pitch = { f0: fmed, jumps, jumpAts, wobble: median(dev), endSt: e1 != null && e0 != null ? e1 - e0 : null, drift: d1 != null && d0 != null ? d1 - d0 : null, startSt: s0 != null && e0 != null ? s0 - e0 : null, track: fr10.map((o) => [tOf(o.i), o.f]) };
      }
      // Stimmabbrüche: stimmlose Lücken im Kern, obwohl Schall da ist (nicht Stille, nicht ch/s-Endlaut)
      let breakMax = 0, breakAt = null; { let gap = 0; const upd = (end) => { if (gap > breakMax) { breakMax = gap; breakAt = tOf(end - gap); } }; for (let i = core[0]; i <= core[m - 1]; i++) { if (!voiced[i] && env[i] >= floorDb + S.ONSET_ABOVE_FLOOR_DB) gap++; else { upd(i); gap = 0; } } upd(core[m - 1] + 1); breakMax *= fr.dt; }
      // Ruckeln: Abweichung der Lautstärke von ihrem eigenen Verlauf (gleitender Median 0,3 s)
      const hwr = frames(0.15), res = []; for (let k = 0; k < m; k++) res.push(Math.abs(lvC[k] - median(lvC.slice(Math.max(0, k - hwr), Math.min(m, k + hwr + 1)))));
      const rough = median(res); let rk = 0; for (let k = 1; k < m; k++) if (res[k] > res[rk]) rk = k; const roughAt = tOf(core[rk]);
      profile = { pitch, breakMax, breakAt, roughAt, rough, voicedDur: m * fr.dt, startRel: startL - plateau, endRel: endL - plateau, maxDrop, slope, vStart: tOf(core[0]), vEnd: tOf(core[m - 1]), core: [tOf(core[0]), tOf(core[m - 1])] };
    }
  }
  // Luft vor dem Laut: vom ersten Rauschen über dem Grundrauschen bis zum Einsetzen der Stimme (Tonhöhe erkennbar)
  let airDur = null, tVoice = null, tAir = null;
  { const need = frames(0.03), a0 = Math.max(0, iOn - frames(0.8)), a1 = Math.min(n, iOn + frames(1.5)); let iV = -1;
    // Stimme = Tonhöhe erkennbar, auch wenn sie noch leise ist (weicher Einsatz): eigene Prüfung ab knapp über dem Grundrauschen
    const vLow = voicedFlags(x, fr, env, floorDb, S, S.AIR_NOISE_DB, a0, a1);
    // erst die sichere Stimme (deutlich über dem Rauschen, 30 ms am Stück), dann zurück bis zu ihrem leisen Beginn
    for (let i = a0; i <= Math.min(iOff, a1) - need; i++) { if (!voiced[i] || env[i] < floorDb + S.ONSET_ABOVE_FLOOR_DB) continue; let ok = true; for (let k = 1; k < need; k++) if (!voiced[i + k]) { ok = false; break; } if (ok) { iV = i; break; } }
    if (iV >= 0) { let gap = 0, k = iV; while (k > a0) { if (vLow[k - 1]) { gap = 0; k--; iV = k; } else if (++gap <= 2) k--; else break; } }
    if (iV >= 0) { let j = iV, dips = 0; const lim = Math.max(0, iV - frames(1.5));
      while (j > lim) { if (envS[j - 1] >= floorDb + S.AIR_NOISE_DB) { dips = 0; j--; } else if (++dips <= 3) j--; else break; }
      j += Math.min(dips, 3); airDur = Math.max(0, (iV - j) * fr.dt); tVoice = tOf(iV); tAir = tOf(j); } }
  let Amax = 0; for (let i = iOn; i <= iOff; i++) Amax = Math.max(Amax, A[i]);
  const restFlux = iOff - iSlowEnd > 4 ? median(flux.subarray(iSlowEnd, iOff + 1)) : null;
  const sf0 = iOn + frames(0.25), slowFlux = iSlowEnd - sf0 > 10 ? median(flux.subarray(sf0, iSlowEnd + 1)) : null;

  return {
    feat: (() => { // pro Rahmen: Lautstärke (dB), stimmhaft, Anteil hoher Frequenzen, Anteil tiefer Frequenzen
      const hfr = new Float32Array(n), lfr = new Float32Array(n);
      for (let i = 0; i < n; i++) { let tot = 1e-20, hf = 0, lf = 0; for (let b = 0; b < NB; b++) { const p = fr.bands[i * NB + b]; tot += p; if (b >= 12) hf += p; if (b <= 6) lf += p; } hfr[i] = hf / tot; lfr[i] = lf / tot; }
      return { env, voiced, hfr, lfr, dt: fr.dt, t0: fr.t0, n }; })(),
    valid: true, ...base, A, Amax, dt: fr.dt, t0: fr.t0, n, tOn: tOf(iOn), tOff: tOf(iOff), tSlowEnd: tOf(iSlowEnd),
    voiced: tOf(iOff) - tOf(iOn), slowDur: tOf(iSlowEnd) - tOf(iOn), restDur: tOf(iOff) - tOf(iSlowEnd), restFlux, slowFlux,
    medFlux: median(flux.subarray(iOn, iOff + 1)), breaks, slowRuns, nLong: longRuns.length, rise: Math.max(fr.dt, tOf(i90) - tOf(i10)), t10: tOf(i10), t90: tOf(i90), i10, i90, overshoot, profile, airDur, tVoice, tAir,
  };
}

// Bewertung: vergleicht die Messung mit den Grenzwerten (LIMITS, aus den CD-Beispielen abgeleitet).
// word = { syl: Anzahl Silben }. Ergebnis: { pass, items: [{ ok, text }], ... }
function judge(t, word, L) {
  const f = (v, d = 1) => v.toFixed(d).replace('.', ','), N = Math.max(1, word.syl || 1), items = [];
  // Zielbereich der Dehnung: mit eigenem Vorbild aus der CD wortspezifisch, sonst Mittelwerte aller Beispiele
  const ref = word.ref || null;
  let lo = L.SLOW_MIN, hi = L.SLOW_MAX;
  if (ref) {
    lo = clamp(ref.slowDur * L.WORD_LO_FACTOR, L.ABS_MIN_SEC, L.ABS_MAX_SEC); hi = clamp(ref.slowDur * L.WORD_HI_FACTOR, L.ABS_MIN_SEC, L.ABS_MAX_SEC);
    if (L.WORD_ONLY_WIDEN) { lo = Math.min(lo, L.SLOW_MIN); hi = Math.max(hi, L.SLOW_MAX); }
  }
  if (!t.valid) {
    const m = { quiet: 'Zu leise oder zu viel Rauschen → näher ans Mikrofon, etwas lauter sprechen.', novoice: 'Keine Stimme erkannt → nochmal versuchen.', short: 'Aufnahme zu kurz → nochmal versuchen.' };
    return { pass: false, fatal: true, level: 'nochmal', lo, hi, items: [{ ok: false, text: m[t.reason] || m.short }] };
  }
  const tgt = `Ziel${ref ? ' für dieses Wort' : ''}: ${f(lo)}–${f(hi)} s`;
  let whole = false;
  // 1. Dehnung der ersten Silbe: Länge
  const restMissing = N >= 2 && (t.restDur < L.REST_MIN_SEC * (N - 1) || (t.restFlux != null && t.restFlux < L.REST_FLUX_MIN && t.restDur > 0.3));
  if (N >= 2 && (t.slowDur > hi || (t.slowDur > L.WHOLE_WORD_SEC && restMissing))) { whole = true; items.push({ ok: false, key: 'whole', text: `Ganzes Wort gedehnt (${f(t.slowDur)} s am Stück). Nur die erste Silbe dehnen.` }); }
  else if (t.slowDur < lo * L.TOO_FAST_FRACTION) items.push({ ok: false, key: 'fast', text: `Fast normales Sprechtempo, kaum gedehnt. ${tgt}.` });
  else if (t.slowDur < lo) items.push({ ok: false, key: 'short', text: `Zu kurz gedehnt (${f(t.slowDur)} s). ${tgt}.` });
  else if (t.slowDur > hi) items.push({ ok: false, key: 'long', text: `Zu lang gedehnt (${f(t.slowDur)} s). ${tgt}.` });
  else items.push({ ok: true, key: 'dur', text: `Dehnung passt (${f(t.slowDur)} s).` });
  // (Prüfung „Mundbewegung zu zackig“ entfernt: zu unzuverlässig)
  // 3. Rest des Wortes (nur bei mehrsilbigen Wörtern): normal schnell
  if (N >= 2 && !whole) {
    const per = t.restDur / (N - 1);
    if (t.restDur < L.REST_MIN_SEC * (N - 1) || (t.restFlux != null && t.restFlux < L.REST_FLUX_MIN && t.restDur > 0.3))
      items.push({ ok: false, key: 'rest', text: 'Rest fehlt oder ist auch gedehnt. Nach der ersten Silbe normal weitersprechen.' });
    else if (per > L.REST_SYL_MAX_SEC) items.push({ ok: false, key: 'restslow', text: `Rest in Zeitlupe (${f(per)} s pro Silbe). Ab der zweiten Silbe normal sprechen.` });
    else items.push({ ok: true, key: 'rest', text: 'Rest des Wortes normal gesprochen.' });
  }
  // 4. Pause mitten im Wort
  const brk = t.breaks.filter((b) => b[1] - b[0] >= L.BREAK_FAIL_SEC);
  if (brk.length) items.push({ ok: false, key: 'break', text: 'Pause mitten im Wort. Durchgehend sprechen.' });
  // 5. Lautstärkeverlauf – nur über die stimmhaften Laute (Endlaute wie ch/s/t zählen nicht)
  const p = t.profile;
  if (p) {
    if (p.startRel > L.START_HARD_DB) items.push({ ok: false, key: 'hard', text: `Anfang zu laut (${f(p.startRel, 0)} dB über der Mitte). Leise beginnen, gleichmäßig lauter werden.` });
    else if (p.endRel < L.END_FADE_DB && p.slope < L.SLOPE_FADE) items.push({ ok: false, key: 'fade', text: `Lautstärke sinkt (am Ende ${f(-p.endRel, 0)} dB leiser). Gleichmäßig halten oder leicht ansteigen lassen.` });
    else if (L.SLOPE_MIN != null && p.slope < L.SLOPE_MIN) items.push({ ok: false, key: 'flat', text: 'Lautstärke bleibt flach. Leise beginnen, gleichmäßig lauter werden.' });
    else items.push({ ok: true, key: 'loud', text: p.slope >= L.SLOPE_RISING ? 'Weicher Einstieg, die Lautstärke steigt sanft an – genau richtig.' : 'Weicher Einstieg, Lautstärke gleichmäßig.' });
  }
  // 6. Stimmlage und Stimmführung (nur an der gedehnten Stelle): Tonhöhe, Stimmabbrüche, Ruckeln
  const q = p && p.pitch;
  if (q) {
    if (q.jumps > L.PITCH_STEPS_MAX || q.wobble > L.PITCH_WOBBLE_MAX) items.push({ ok: false, key: 'pitch', text: `Tonhöhe ${q.jumps > L.PITCH_STEPS_MAX ? 'springt' : 'wackelt'}. Stimme gleichmäßig tragen.` });
    else if (q.drift != null && q.drift < L.PITCH_DRIFT_MIN_ST) items.push({ ok: false, key: 'air', text: `Tonhöhe sackt gegen Ende ab (${f(-q.drift)} Halbtöne), die Luft wird knapp. Etwas kürzer dehnen.` });
    else items.push({ ok: true, key: 'pitch', text: 'Tonhöhe ruhig und gleichmäßig.' });
  }
  if (p) {
    if (p.breakMax > L.VOICE_BREAK_MAX_SEC) items.push({ ok: false, key: 'voicebreak', text: 'Stimme setzt zwischendurch aus. Durchgehend schwingen lassen.' });
    if (p.rough > L.ROUGH_MAX) items.push({ ok: false, key: 'rough', text: 'Lautstärke ruckelt. Gleichmäßig führen.' });
  }
  // 7. Luft vor dem Laut (nur bei Wörtern, die mit Vokal oder stimmhaftem Laut beginnen; pro Wort ein-/ausschaltbar)
  if (word.airCheck && t.airDur != null) {
    const refAir = ref && ref.air != null ? ref.air : L.AIR_REF_DEFAULT_SEC, lim = Math.max(L.AIR_MIN_SEC, refAir + L.AIR_EXTRA_SEC);
    if (t.airDur > lim) items.push({ ok: false, key: 'airstart', text: `Luft vor dem Laut, Stimme früher einsetzen (${f(t.airDur, 2)} s Luft vor der Stimme, Vorlage ${f(refAir, 2)} s).` });
    else items.push({ ok: true, key: 'airstart', text: 'Stimme setzt ohne Luft davor ein.' });
  }
  const MAJOR = ['fast', 'whole', 'rest', 'break', 'hard', 'voicebreak'];
  items.forEach((i) => { if (!i.ok) i.sev = MAJOR.includes(i.key) ? 'major' : 'minor'; });
  const bad = items.filter((i) => !i.ok), level = !bad.length ? 'gut' : bad.some((i) => i.sev === 'major') ? 'nochmal' : 'fast';
  bad.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'major' ? -1 : 1));
  return { pass: level === 'gut', level, items: [...bad, ...items.filter((i) => i.ok)], lo, hi };
}

// Spektrogramm (Klangbild) zur Anzeige: Zeit x Frequenz, Helligkeit = Lautstärke
function spectrogram(x, sr, maxHz) {
  const N = 1024, hop = Math.round(sr * 0.01), { fft, win } = getFFT(N), binHz = sr / N, nb = Math.floor(maxHz / binHz);
  const n = x.length >= N ? Math.floor((x.length - N) / hop) + 1 : 0, re = new Float64Array(N), im = new Float64Array(N), db = new Float32Array(n * nb);
  let mx = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * hop; for (let k = 0; k < N; k++) { re[k] = x[o + k] * win[k]; im[k] = 0; } fft(re, im);
    for (let b = 0; b < nb; b++) { const v = 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-12); db[i * nb + b] = v; if (v > mx) mx = v; }
  }
  return { db, n, nb, hop, sr, maxDb: mx, t0: N / 2 / sr, dt: hop / sr, binHz };
}

// ---------- Zuordnung der Laute zu den Buchstaben des Wortes ----------
// Aus der Schreibweise werden die erwarteten Laute abgeleitet (grobe deutsche Regeln), jeder Laut gehört zu einer Klasse:
// V Vokal, N Nasal (m, n, ng), L Fließlaut (l, r), Z stimmhafter Reibelaut (w, j, s vor Vokal), F stimmloser Reibelaut (f, s, sch, ch),
// H Hauchlaut (h), P Verschlusslaut stimmlos (p, t, k), B Verschlusslaut stimmhaft (b, d, g)
function wordPhones(text) {
  const orig = text.replace(/[^A-Za-zÄÖÜäöüß]/g, ''), t = orig.toLowerCase(), VOW = 'aeiouäöüy', out = [];
  const isV = (c) => c != null && VOW.includes(c);
  let i = 0;
  const push = (len, c, g) => { out.push({ g: g != null ? g : orig.substr(i, len), c }); };
  while (i < t.length) {
    const r = t.slice(i), c = t[i], nx = t[i + 1], pv = t[i - 1], at = (s) => r.startsWith(s);
    if (i === 0 && at('sch')) { push(3, 'F'); i += 3; continue; }
    if (i === 0 && (at('st') || at('sp'))) { out.push({ g: orig[0], c: 'F' }); i += 1; continue; }
    if (at('tsch')) { out.push({ g: orig[i], c: 'P' }); out.push({ g: orig.substr(i + 1, 3), c: 'F' }); i += 4; continue; }
    if (at('sch')) { push(3, 'F'); i += 3; continue; }
    if (at('ch')) { push(2, 'F'); i += 2; continue; }
    if (at('pf')) { out.push({ g: orig[i], c: 'P' }); out.push({ g: orig[i + 1], c: 'F' }); i += 2; continue; }
    if (at('ph')) { push(2, 'F'); i += 2; continue; }
    if (at('tz')) { out.push({ g: orig[i], c: 'P' }); out.push({ g: orig[i + 1], c: 'F' }); i += 2; continue; }
    if (at('ck')) { push(2, 'P'); i += 2; continue; }
    if (at('ng')) { push(2, 'N'); i += 2; continue; }
    if (at('nk')) { out.push({ g: orig[i], c: 'N' }); out.push({ g: orig[i + 1], c: 'P' }); i += 2; continue; }
    if (at('qu')) { out.push({ g: orig[i], c: 'P' }); out.push({ g: orig[i + 1], c: 'Z' }); i += 2; continue; }
    if (at('ie') || at('ei') || at('ai') || at('au') || at('eu') || at('äu') || at('aa') || at('ee') || at('oo')) { push(2, 'V'); i += 2; continue; }
    if (isV(c)) { push(1, 'V'); i += 1; continue; }
    if (c === 'h' && isV(pv)) { if (out.length) out[out.length - 1].g += orig[i]; i += 1; continue; }     // Dehnungs-h
    if (nx === c && !'aeiou'.includes(c)) { out.push({ g: orig.substr(i, 2), c: classOf(c, pv, t[i + 2]) }); i += 2; continue; }   // Doppelkonsonant = ein Laut
    if (c === 'z' || c === 'x') { out.push({ g: orig[i], c: 'P' }); out.push({ g: '', c: 'F' }); i += 1; continue; }
    push(1, classOf(c, pv, nx)); i += 1;
  }
  return out.filter((p) => !(p.g === '' && p.c === 'F' && false));
  function classOf(c, pv, nx) {
    if (c === 'r') return isV(pv) && !isV(nx) ? 'V' : 'R';
    if (c === 'l') return 'L';
    if (c === 'm' || c === 'n') return 'N';
    if (c === 'f' || c === 'v' || c === 'ß') return 'F';
    if (c === 's') return isV(nx) ? 'Z' : 'F';
    if (c === 'w' || c === 'j') return 'Z';
    if (c === 'h') return 'H';
    if (c === 'p' || c === 't' || c === 'k' || c === 'c' || c === 'q') return 'P';
    if (c === 'b' || c === 'd' || c === 'g') return 'B';
    return 'L';
  }
}
function alignWord(take, text) {
  const f = take.feat; if (!take.valid || !f) return null;
  const ph = wordPhones(text); if (ph.length < 1 || ph.length > 16) return null;
  const step = 2, dt = f.dt * step, tr = (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? (x - a) / (b - a) : x <= c ? 1 : (d - x) / (d - c));
  let iA = Math.round((take.tOn - f.t0) / f.dt); { const lim = Math.max(0, iA - Math.round(0.8 / f.dt)); while (iA > lim && f.env[iA - 1] >= take.floorDb + 4) iA--; iA = Math.max(0, iA - 2); }
  const iB = Math.min(f.n - 1, Math.round((take.tOff - f.t0) / f.dt) + 4);
  const nf = Math.floor((iB - iA) / step) + 1; if (nf < ph.length * 3) return null;
  const cls = ['V', 'N', 'L', 'R', 'Z', 'F', 'H', 'P', 'B'], cost = {}; cls.forEach((c) => { cost[c] = new Float64Array(nf + 1); });
  for (let k = 0; k < nf; k++) {
    const i = iA + k * step, rel = f.env[i] - take.peakDb, ab = f.env[i] - take.floorDb, vo = f.voiced[i] ? 1 : 0, hf = f.hfr[i], lf = f.lfr[i];
    const sc = {
      V: vo * tr(rel, -30, -14, 3, 6) * (1 - 0.8 * Math.min(1, hf * 2)),
      N: vo * tr(rel, -40, -28, -8, -2) * Math.min(1, lf / 0.7) * (1 - Math.min(1, hf * 4)),
      L: vo * tr(rel, -36, -22, -6, -1) * (1 - 0.5 * Math.min(1, hf * 1.5)),
      Z: vo * tr(hf, 0.08, 0.2, 0.6, 0.95) * tr(rel, -40, -28, -6, -1),
      F: (1 - 0.7 * vo) * tr(hf, 0.2, 0.45, 1, 1.01) * tr(ab, 5, 12, 80, 99),
      H: (1 - 0.5 * vo) * tr(hf, 0.08, 0.2, 0.7, 0.95) * tr(ab, 3, 8, 30, 60),
      P: Math.max(tr(ab, -1, 0, 4, 10), (1 - vo) * tr(hf, 0.2, 0.4, 1, 1.01) * 0.7),
      B: Math.max(0.6 * tr(ab, -1, 0, 4, 10), vo * tr(rel, -45, -34, -18, -6) * 0.8),
    };
    sc.R = Math.max(sc.L, 0.8 * sc.F, 0.6 * sc.H);
    cls.forEach((c) => { cost[c][k + 1] = cost[c][k] + (1 - sc[c]); });
  }
  const minF = { V: 6, N: 4, L: 3, R: 3, Z: 4, F: 5, H: 3, P: 4, B: 3 }, m = ph.length, INF = 1e18;
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(nf + 1).fill(INF)), bk = Array.from({ length: m + 1 }, () => new Int32Array(nf + 1));
  dp[0][0] = 0;
  for (let j = 1; j <= m; j++) {
    const c = ph[j - 1].c, mn = minF[c] || 3, cs = cost[c], plosive = c === 'P' || c === 'B';
    for (let i = j * 3; i <= nf; i++) {
      let best = INF, arg = 0;
      for (let d = mn; d <= i; d++) {
        const prev = dp[j - 1][i - d]; if (prev >= INF) continue;
        let v = prev + (cs[i] - cs[i - d]) + (plosive && d > 25 ? 0.05 * (d - 25) : 0) + (!plosive && d > 150 ? 0.01 * (d - 150) : 0);
        if (v < best) { best = v; arg = d; }
      }
      dp[j][i] = best; bk[j][i] = arg;
    }
  }
  if (dp[m][nf] >= INF) return null;
  const seg = []; let i = nf;
  for (let j = m; j >= 1; j--) { const d = bk[j][i]; seg.unshift({ g: ph[j - 1].g, c: ph[j - 1].c, t0: f.t0 + (iA + (i - d) * step) * f.dt, t1: f.t0 + (iA + i * step) * f.dt }); i -= d; }
  const conf = 1 - dp[m][nf] / nf;
  return { seg, conf };
}

// ---------- Wo in der Aufnahme steckt das Wort? ----------
// Sucht den stärksten zusammenhängenden Sprachabschnitt; kurze Geräusche (Klicks, Klopfen) und alles davor/danach fallen weg.
function findWordRegion(x, sr, S) {
  const hop = Math.round(sr * 0.01), n = Math.floor(x.length / hop); if (n < 30) return null;
  const raw = new Float32Array(n), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < hop; k++) { const v = x[i * hop + k]; s += v * v; } raw[i] = toDb(Math.sqrt(s / hop)); }
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { s += raw[k]; c++; } env[i] = s / c; }   // 50 ms geglättet
  const floor = percentile(env, 10), on = floor + S.REGION_START_DB, hold = floor + S.REGION_HOLD_DB, gap = Math.round(S.REGION_GAP_SEC / 0.01), runs = [];
  let a = -1, last = -1, active = false;
  for (let i = 0; i <= n; i++) {
    const v = i < n ? env[i] : -999;
    if (!active && v >= on) { active = true; if (a < 0 || i - last > gap) { if (a >= 0) runs.push([a, last]); a = i; } }
    if (active) { if (v >= hold) last = i; else active = false; }
  }
  if (a >= 0) runs.push([a, last]);
  let best = null, bestScore = 0;
  for (const [s, e] of runs) {
    if ((e - s + 1) * 0.01 < S.REGION_MIN_SEC) continue;            // zu kurz: Klick oder Klopfen
    let sc = 0; for (let i = s; i <= e; i++) if (env[i] >= hold) sc += env[i] - hold;
    if (sc > bestScore) { bestScore = sc; best = [s, e]; }
  }
  if (!best) return null;
  // leise Ränder dazunehmen (weicher Einsatz, leises f/s), höchstens REGION_EDGE_SEC und nicht über Lücken hinweg
  let s0 = best[0], e0 = best[1]; const ext = Math.round(S.REGION_EDGE_SEC / 0.01), soft = floor + S.REGION_EDGE_DB;
  const grow = (i, dir) => { let dips = 0, k = 0, j = i; while (k++ < ext) { const nx = j + dir; if (nx < 0 || nx >= n) break; if (env[nx] >= soft) { dips = 0; j = nx; } else if (++dips > 5) break; else j = nx; } return j - dir * Math.min(dips, 5); };
  s0 = grow(s0, -1); e0 = grow(e0, 1);
  const pad = Math.round(S.REGION_PAD_SEC / 0.01);
  return { start: Math.max(0, (s0 - pad) * hop), end: Math.min(x.length, (e0 + 1 + pad) * hop), runs: runs.length };
}
// ==== CORE END
