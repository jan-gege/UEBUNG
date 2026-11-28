# Dehnübung (Stottertherapie): Übergabe für einen neuen Claude-Chat

Stand: 27.11.2026, Version mit „Luft-Check“ und Übungsprotokoll.

## 1. Worum es geht

- Eine einfache Übungsseite fürs Handy zum **Prolongieren (Dehnen)** nach Kasseler Stottertherapie bzw. Fluency Shaping: weicher Stimmeinsatz, erste Silbe gedehnt, gleichmäßig anschwellen, Rest des Wortes normal.
- Eigenständiges Projekt mit eigenem Repo.
- Alles läuft **nur im Browser**: Web Audio, keine Server-Logik, kein Login, keine Cloud, keine Spracherkennung, keine KI-API.
- **Live-Seite:** https://jan-gege.github.io/UEBUNG/

## 2. Repo und Veröffentlichen

- Alles liegt im Repo `jan-gege/UEBUNG` (öffentlich, GitHub Pages aus `main`, Root). Nichts davon gehört in andere Repos.
- `index.html` im Root ist die fertige Seite; `quellcode/` enthält Build-System, Analyse-Kern und Tests; `.nojekyll` verhindert, dass GitHub Pages Dateien umwandelt.

So wird veröffentlicht:

1. `python3 quellcode/build/build.py` schreibt `index.html` im Root.
2. Committen und auf `main` pushen. GitHub Pages ist nach ca. 1–2 Minuten aktuell.

Fehlt das Repo in einer neuen Cloud-Session: mit `add_repo` (owner `jan-gege`, repo `UEBUNG`, access `push`) anhängen und klonen.

**Nie hochladen:** die CD-Tonaufnahmen des Logopäden (siehe Abschnitt 9), das Repo ist öffentlich. Im Code stehen nur daraus abgeleitete Zahlen.

## 3. Arbeitsweise

- Grenzwerte immer als **Variablen oben im Code**.
- Getestet wird hauptsächlich auf dem iPhone (Safari).

## 4. Dateien

```
UEBUNG/
  index.html                  fertige Seite (eine Datei, ca. 95 KB, ohne externe Abhängigkeiten)
  UEBERGABE.md                diese Datei
  quellcode/
    build/template2.html      Oberfläche: HTML, CSS, Konstanten, UI-Code; Platzhalter /*CORE*/ und /*REFWORDS*/
    build/refwords.json       Referenzwerte pro CD-Wort (erzeugt von t/genref.js)
    build/build.py            setzt template2.html + core2.js + refwords.json zusammen → ../../index.html (Root)
    t/core2.js                Analyse-Kern (zwischen "// ==== CORE START" und "// ==== CORE END")
    t/setdef.js               SETTINGS/LIMITS für Node-Tests (muss zu den Werten im Template passen!)
    t/ref.js                  lädt core2.js in Node und die CD-Audios (silben.f32/antwort.f32, NICHT im Repo) + segs.json
    t/segs.json               Zeitabschnitte (Start/Ende in s) der einzelnen Beispiele auf den zwei CD-Tracks
    t/genref.js               misst die CD-Beispiele → refwords.json
    t/refpass.js              alle 15 CD-Beispiele müssen „gut“ ergeben
    t/scen.js, t/synth.js     Szenarien bzw. künstliche Stimmen mit eingebauten Fehlern
    t/airtest.js, t/mkair.js  Luft-vor-dem-Laut-Tests (künstlich) bzw. syn_air.wav für den Browser-Test
    t/mkwav.js                künstliche Test-WAVs (syn_good/jump/break)
    t/mktestset.js            baut t/testset/ (29 WAVs aus den CD-Audios, NICHT im Repo)
    t/e2e9.js                 Playwright: mehrere Runden inkl. automatischem Start
    t/e2e10.js                Playwright: Rückmeldung, Messwerte, Screenshot
    t/e2e11.js                Playwright: Luft-Check, Protokoll, Markieren, ZIP-Export (braucht HTTP-Server auf Port 8765)
    t/e2etest.js              Playwright: Testmodus mit t/testset/ (zuletzt 29/29)
```

**Wichtig:** Die Analyse-Funktionen gibt es nur einmal, in `core2.js`. `build.py` kopiert sie in die Seite und entfernt dabei nur die alte Funktion `spectrogram`. SETTINGS und LIMITS stehen doppelt: im Template (zählt für die Seite) und in `setdef.js` (zählt für die Node-Tests). Bei Änderungen beide anpassen.

## 5. Aufbau von index.html (Reihenfolge im Script)

1. `WORDS_DEFAULT`: 153 Wörter in Gruppen; `#` = Überschrift, `|` = Silbengrenze, z. B. `Ber|lin`.
2. `REF_WORDS`: Inhalt von refwords.json, pro CD-Wort `slowDur, voiced, start, end, slope, air, curve`.
3. `LIMITS` (Stufe „streng“, Standard), `LIMITS_NORMAL` (nachsichtiger, überschreibt einzelne Werte), `applyStrictness(mode)`.
4. `SETTINGS`: Messung, Aufnahme, Protokoll.
5. Analyse-Kern aus `core2.js`.
6. Oberfläche: Bildschirme `screenMain`, `screenFb`, `screenSet`, `screenTest`, `screenLog`, umgeschaltet mit `show(name)`.

### Ablauf für den Nutzer

- **Hauptseite:** ein zufälliges Wort. Darüber die Chips „Silben“ (zeigt Silben, erste Silbe blau), „Luft-Check“ (pro Wort) und ⚙. Unten der große Knopf „● Sprechen“.
- Nur der **allererste** Versuch braucht einen Tipp auf „Sprechen“. „Nochmal versuchen“, „Noch einmal“, „Nächstes Wort“ und „Überspringen“ starten die Aufnahme sofort.
- **Rückmeldeseite:** Stufe **Gut ✓ / Fast / Nochmal** mit Titel des wichtigsten Fehlers, einem konkreten Hinweis samt Stelle im Wort, dem Graph und der Messwertzeile („Start … · Dehnung … · Anstieg … ms · Luft … s“), dazu „☆ Für Logopäde“. Es geht nie automatisch weiter.

## 6. Aufnahme (startRecording / finishRecording)

- `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`, weil die Automatiken den Lautstärkeverlauf verfälschen. Der Mikro-Stream wird wiederverwendet, solange er „live“ ist.
- Kette: MediaStreamSource → Biquad-Hochpass 60 Hz (`REC_HIGHPASS_HZ`) → Analyser (Pegelanzeige, Sprecherkennung) und ScriptProcessor(4096) für rohes PCM.
- **Kein MediaRecorder**: Opus-Kompression hat die Messwerte verfälscht.
- Die ersten `REC_SKIP_MS` = 450 ms werden verworfen (Tipp-Klick).
- Zustände in einer requestAnimationFrame-Schleife:
  - `arm` bis `REC_ARM_MS` = 950 ms: misst das Grundrauschen (Median der dB-Werte > −100).
  - `listen`: Stimme, sobald 150 ms lang mehr als `REC_VOICE_DB` = 10 dB über dem Grundrauschen.
  - `speak`: Stopp nach `REC_SILENCE_MS` = 1200 ms Stille (unter Grundrauschen + `REC_SILENCE_DB` = 9 dB), wenn insgesamt mindestens `REC_MIN_VOICE_MS` = 500 ms Stimme da war, sonst zurück zu `listen`. Kurze Geräusche setzen den Stille-Zähler nur teilweise zurück (`silenceMs − 3·dt`). Spätestens nach `REC_MAX_SPEAK_MS` = 8000 ms ist Schluss. Antippen beendet sofort.
- Danach Resampling auf 22050 Hz (`ANALYSIS_SR`) mit OfflineAudioContext, dann `evaluateRecording`, `showResult` und `logSave`.

## 7. Auswertung

### evaluateRecording(raw, word)

1. `normalizePeak`: auf den 99,5-%-Spitzenwert der 10-ms-RMS normieren (Ziel 0,3).
2. `ref` = die ersten `NOISE_REF_SEC` = 0,5 s als Bezug für das Grundrauschen.
3. `findWordRegion`: findet das Wort in der Aufnahme. 10-ms-Hüllkurve, 50 ms geglättet, Boden = 10-%-Perzentil. Hysterese: Start bei Boden + 14 dB, halten bei + 8 dB. Ränder werden bis + 5 dB erweitert (höchstens 1,5 s), Lücken bis 0,4 s überbrückt, Mindestlänge 0,2 s, 0,3 s Rand. Alles außerhalb wird weggeschnitten (Klopfen, Räuspern, Geräusche).
4. `analyzeTake(Ausschnitt, 22050, SETTINGS, ref)`, dann `judge(t, {...word, airCheck: airOn(word)}, LIMITS)`.
5. Rückgabe `{t, j, audio}`; `audio` ist der rohe (nicht normierte) Wortausschnitt fürs Protokoll.

### analyzeTake (core2.js)

- **Rahmen:** 512 Samples, Hop 5 ms, Hann-Fenster, eigene FFT. 16 logarithmische Bänder von 100 bis 8000 Hz. `env` = Rahmen-RMS in dB.
- **Grundrauschen:** Median der Ref-Rahmen, sofern plausibel (≤ 20-%-Perzentil + 3 dB), sonst 5-%-Perzentil. Dazu ein Rausch-Spektrum pro Band. Ist der Abstand Spitze − Rauschen unter `MIN_SNR_DB` = 12, ist die Aufnahme ungültig („quiet“).
- **Stimme von/bis (iOn/iOff):** erster bzw. letzter Rahmen mit 50 ms am Stück über min(Rauschen + 8 dB, Spitze − 6 dB).
- **Pausen im Wort:** ≥ 0,2 s unter Rauschen + 3 dB.
- **Dehnung über gleichbleibenden Klang, nicht über Lautstärke:**
  - Je Band die Rauschleistung abziehen und in dB umrechnen, dann pro Rahmen den Mittelwert über die Bänder abziehen. So zählt nur die Klangfarbe; ein absichtlich ansteigender weicher Einsatz gilt nicht als Klangänderung.
  - Spektraler Fluss = RMS-Änderung über ±40 ms in dB/s, danach gleitender Median über 0,4 s.
  - „Langsam“ heißt Fluss < `SLOW_FLUX_MAX` = 55. Läufe ≥ 0,4 s, Lücken bis 0,25 s überbrückt (z. B. Verschlusslaute).
  - Ende der Dehnung `iSlowEnd` = Ende des letzten Laufs ≥ 0,6 s, sonst Ende des längsten Laufs.
  - `slowDur = t(iSlowEnd) − t(iOn)`, `restDur = t(iOff) − t(iSlowEnd)`, `restFlux` = Median-Fluss im Rest.
- **Anstiegszeit (`rise`):** 10 → 90 % der Amplitude, bezogen auf den Pegel im Einsatzfenster. Dazu `overshoot` (Anfangsspitze).
- **Stimmhaftigkeit (`voicedFlags`):** normierte Autokorrelation im Bereich 70–400 Hz, r ≥ 0,55, nur bei Pegel ≥ Rauschen + 8 dB. Optionale Parameter `minAbove, i0, i1` werden für den Luft-Check genutzt.
- **`profile`:** nur über die stimmhaften Rahmen der gedehnten Stelle (Kern, höchstens 15 dB unter der Spitze):
  - `startRel` / `endRel`: Anfang bzw. Ende gegenüber der Mitte in dB.
  - `slope`: Lautstärkeanstieg in dB/s (lineare Regression).
  - `pitch`: YIN (Schwelle 0,15) alle 10 ms. Daraus `jumps` (Sprünge > 3 Halbtöne, dauerhaft; die ersten 0,2 s und die letzten 0,2 s werden ausgelassen), `wobble` (Wackeln), `drift` (Absinken zum Ende).
  - `breakMax`: Stimmabbruch = stimmlos, obwohl Schall da ist.
  - `rough`: Ruckeln = Abweichung vom gleitenden Median über 0,3 s.
- **Luft vor dem Laut (`airDur`, `tAir`, `tVoice`), neu:**
  1. Sichere Stimme suchen: ab iOn − 0,8 s der erste Rahmen, der 30 ms am Stück stimmhaft und ≥ Rauschen + 8 dB ist.
  2. Von dort zurückgehen, solange eine zweite Stimmhaftigkeits-Prüfung schon ab Rauschen + `AIR_NOISE_DB` = 5 dB Tonhöhe findet (Lücken bis 2 Rahmen). Ergebnis ist `tVoice`, der leise Beginn der Stimme; so zählt ein sehr weicher, leiser Einsatz nicht als Luft.
  3. Von `tVoice` weiter zurückgehen, solange der Pegel (25 ms geglättet) ≥ Rauschen + 5 dB ist (Einbrüche bis 3 Rahmen). Ergebnis ist `tAir`.
  4. `airDur = tVoice − tAir`. Ein Einatmen mit Pause davor zählt nicht.
- **Rückgabe:** zusätzlich `feat` (für die Laut-Zuordnung), `A`/`Amax`/`t0`/`dt`/`n` (Kurve), `tOn`/`tOff`/`tSlowEnd`, `breaks`.

### judge(t, word, L): Regeln

`word = {parts, text, syl, ref, airCheck}`. Zielbereich der Dehnung: ohne CD-Vorbild `SLOW_MIN..SLOW_MAX` = 1,0–4,5 s. Mit Vorbild `ref.slowDur·0,7 .. ·1,6`, begrenzt auf 0,8–4,5 s; wegen `WORD_ONLY_WIDEN` wird der Bereich dabei nur größer, nie enger.

| key | Bedingung | Schwere |
|---|---|---|
| `whole` | mehrsilbig und (slowDur > hi oder slowDur > `WHOLE_WORD_SEC` 3,0 bei fehlendem Rest) | major |
| `fast` | slowDur < lo·`TOO_FAST_FRACTION` 0,5 | major |
| `short` / `long` | slowDur < lo bzw. > hi | minor |
| `rest` | mehrsilbig: restDur < `REST_MIN_SEC` 0,25·(Silben−1) oder restFlux < `REST_FLUX_MIN` 45 | major |
| `restslow` | Rest pro Silbe > `REST_SYL_MAX_SEC` 0,9 | minor |
| `break` | Pause ≥ `BREAK_FAIL_SEC` 0,5 s | major |
| `hard` | startRel > `START_HARD_DB` 3,5 | major |
| `fade` | endRel < −3 und slope < −2 | minor |
| `flat` | slope < `SLOPE_MIN` 1,0 dB/s (in „normal“ aus) | minor |
| `pitch` | Sprünge > 0 oder Wackeln > 0,18 Halbtöne | minor |
| `air` | Tonhöhe sackt ab, drift < −5,5 Halbtöne („Luft wird knapp“) | minor |
| `voicebreak` | breakMax > 0,2 s | major |
| `rough` | rough > 0,8 dB | minor |
| `airstart` (neu) | nur wenn `word.airCheck`: airDur > max(`AIR_MIN_SEC` 0,25; Vorlage + `AIR_EXTRA_SEC` 0,15). Vorlage = `ref.air`, sonst `AIR_REF_DEFAULT_SEC` 0,05. Text: „Luft vor dem Laut, Stimme früher einsetzen (x s Luft vor der Stimme, Vorlage y s).“ | minor |

- **Stufe:** keine Fehler = `gut`; mindestens ein major = `nochmal`; sonst `fast`. Fehler werden nach Schwere sortiert.
- **„Normal“** ändert unter anderem: SLOW_MIN 0,8, SLOW_MAX 5,0, START_HARD_DB 7, SLOPE_MIN null, Tonhöhe lockerer, AIR_MIN_SEC 0,35, AIR_EXTRA_SEC 0,25.
- Die Kommentare im Template nennen zu jedem Grenzwert die CD-Messwerte in eckigen Klammern.

## 8. Rückmeldung (showResult)

- **Titel** aus `TITLES[key]`, Text = erster Fehler, dazu „Stelle: …“ aus `issueWhere` und „Außerdem: …“ (2 weitere).
- **Laut-/Silbenzeile (`buildChunks`):**
  - `wordPhones(text)` ist eine grobe regelbasierte deutsche Graphem→Laut-Umsetzung mit Klassen: V Vokal, N m/n/ng, L l, R r, Z stimmhafter Reibelaut (w, j, s vor Vokal), F stimmlos (f, s, sch, ch), H h, P p/t/k, B b/d/g.
  - `alignWord` ordnet die Laute per DP den Merkmalen der Aufnahme zu.
  - Verlässlich sind nur Rauschlaute, Verschlusslaute und die Grenze gedehnte Silbe / Rest. Vokale, l, r, m, n werden zu Blöcken zusammengefasst (z. B. „ra“). Bei geringer Sicherheit (conf < 0,6) gibt es nur Silbenblöcke.
- **`issueWhere`** bestimmt die markierten Blöcke und die Zeit für die orange Strichlinie. `airstart` = „vor ‚Mu‘“ bei `tAir`.
- **`drawPlot`** (Canvas):
  - Blau: eigene Lautstärkekurve.
  - Grün gefüllt: Zielkurve aus `targetCurve`. Sie beginnt leise und steigt mit `ref.slope` (begrenzt auf 3–8, sonst 5 dB/s) bis zur Zieldauer an, dann folgt ein kurzer Abfall.
  - Senkrechte Linien „Start“ und „Ende Dehnung“ (Ende nur bei slowDur ≥ 0,3 s); die Achse beginnt bei 0 s am Anfang des Ausschnitts.
  - Bei `airstart`-Fehler ein orange gefülltes Feld „Luft“ von `tAir` bis `tVoice`.
  - Darunter die Laut-/Silbenzeile, Fehlerblöcke orange.

## 9. CD-Referenz (Logopäden-Aufnahmen)

- Zwei MP3-Tracks einer Übungs-CD: Track „Silben mit zwei Mitlauten“ und Track „Antwort mit einem Wort“.
- Umgewandelt mit `ffmpeg -i X.mp3 -ac 1 -ar 22050 -f f32le silben.f32` bzw. `antwort.f32`. **Nicht im Repo** (Urheberrecht). Für refpass, genref und mktestset müssen sie neu bereitgestellt werden.
- `segs.json` = automatisch gefundene Abschnitte. Genutzte Indizes: silben 5 Fra, 7 Pro, 9 Krie, 11 Bla, 13 Glei, 16 Tra, 18 Frei, 20 Bru, 22 Dra, 24 Flo, 26 Schlie, 28 Gra, 30 Troll; antwort 3 Berlin, 6 Milch; „zwei“ = antwort 29,66–33,30 s. Ungerade Indizes ab 15 auf „silben“ sind normal schnell gesprochen (Negativbeispiele).
- Gemessen: Dehnung 1,5–2,5 s, normale Silben 0,53–0,82 s, Luft vor der Stimme 0,00–0,07 s.

## 10. Luft-Check pro Wort

- Standard aus dem ersten Laut: an, wenn `wordPhones(text)[0].c` in `SETTINGS.AIR_START_CLASSES` = `'VNLRZ'` liegt (Vokal, m/n, l, r, w/j/stimmhaftes s).
- b/d/g sind standardmäßig aus, weil der Verschluss sonst als Luft gemessen würde. Von der Standardliste sind 44 Wörter an.
- Eigene Wahl in `localStorage['dehn_air']` = `{"Wort": true|false}`. Entspricht die Wahl dem Standard, wird der Eintrag gelöscht.
- Chip „Luft-Check ✓“ = an. Die Messwertzeile zeigt „Luft x s“ nur, wenn der Check an ist.

## 11. Übungsprotokoll (neu)

- **Speicherung:** IndexedDB, Datenbank `dehnuebung` (Version 1), Store `tries`, keyPath `id` (autoIncrement), Index `ts`.
- **Ein Datensatz:**
  ```js
  { ts, word: 'Ber|lin', level: 'gut'|'fast'|'nochmal', hint: 'Titel', text: 'alle Fehlertexte mit |',
    values: { start, slow, rise, air, startRel, endRel, slope } | null, airCheck, strict: 'streng'|'normal',
    forTherapist: false, wav: ArrayBuffer }
  ```
- **Audio:** `wav` ist eine WAV-Datei mit 16 Bit, mono, 22050 Hz, Wortausschnitt mit Spitze auf 0,9 normiert (`wavBytes`). Bewusst ein ArrayBuffer statt Blob, weil das in Safari zuverlässiger ist.
- **Wann gespeichert wird:** jeder Live-Versuch in `finishRecording` über `logSave`. Testmodus-Dateien werden nicht gespeichert.
- **Aufräumen und Speicherschutz:** Danach `navigator.storage.persist()`. Es bleiben die letzten `LOG_KEEP_UNMARKED` = 1000 nicht markierten Versuche; markierte werden nie gelöscht.
- **Rückmeldeseite:** Chip `#markTher` „☆/★ Für Logopäde“, aktiv sobald gespeichert (`curLogId`).
- **Bildschirm `screenLog`** (⚙ → Übungsprotokoll):
  - Info-Zeile und Filter „nur Für Logopäde“.
  - Liste der neuesten 300 mit ▶ (Audio-Element mit Blob-URL), ☆/★ und ✕ (mit Rückfrage).
- **ZIP-Export:** eigener ZIP-Schreiber `makeZip` ohne Kompression (STORE) mit CRC32, UTF-8-Flag (0x0800) und DOS-Zeitstempeln. Inhalt:
  - `aufnahmen/NNN_JJJJ-MM-TT_hh-mm-ss_Wort.wav` (Umlaute → ae/oe/ue/ss)
  - `versuche.csv`: UTF-8 mit BOM, `;` als Trenner, Dezimalkomma, CRLF. Spalten: Nr; Datei; Datum; Uhrzeit; Wort; Ergebnis; Hinweis; Alle Hinweise; Start (s); Dehnung erster Laut (s); Anstiegszeit (ms); Luft vor der Stimme (s); Luft-Check; Lautstärke Anfang ggü. Mitte (dB); Lautstärke Ende ggü. Mitte (dB); Lautstärke-Anstieg (dB/s); Strenge
- **Herunterladen und Teilen:** Nach „Markierte als ZIP exportieren“ erscheinen ein echter Link „ZIP speichern“ (`<a download>`, damit iOS den Tipp als Nutzeraktion zählt) und, falls `navigator.canShare({files})`, ein Knopf „Teilen …“ (`navigator.share`). Dateiname: `Dehnuebung_Logopaede_JJJJ-MM-TT.zip`.
- **iPhone-Hinweis:** Safari löscht Daten von Webseiten nach 7 Tagen ohne Nutzung (WebKit-Regel, wahrscheinlich). Als Home-Bildschirm-App ist die Seite davon ausgenommen.

## 12. Testmodus (⚙ → Testmodus)

- Aufnahmen hochladen (`decodeToMono`). Das Wort wird aus dem Dateinamen geraten (`guessWord`) und ist änderbar.
- Jede Aufnahme als korrekt oder fehlerhaft markieren, dann „Auswerten“.
- Zählt: korrekt = „gut“, fehlerhaft = „nicht gut“. Zeigt richtig erkannt x von n, getrennt nach beiden Gruppen.

## 13. localStorage-Schlüssel

`dehn_words` (eigene Wortliste), `dehn_syl` (Silben an), `dehn_strict` (streng/normal), `dehn_air` (Luft-Check pro Wort).

## 14. Tests ausführen

```bash
cd quellcode/t
node refpass.js      # braucht silben.f32/antwort.f32 → „15 von 15“
node synth.js; node airtest.js; node scen.js
node mkwav.js; node mkair.js
node e2e9.js m_milch Milch 4      # bzw. syn_good Mut 4; die WAV muss im Ordner liegen
(cd ../.. && python3 -m http.server 8765 &) ; node e2e11.js syn_air Mut
node mktestset.js && node e2etest.js   # braucht CD-Audios
```

- Playwright und Chromium sind in der Cloud-Umgebung vorinstalliert. Die Mikrofon-Simulation läuft über `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=DATEI.wav`.
- Für IndexedDB-Tests (`e2e11`) per HTTP laden, nicht über file://.
- **Letzte Ergebnisse:** refpass 15/15, Testmodus 29/29, synth S1–S6 wie erwartet. airtest: 0,3 s und mehr Luft gibt einen Hinweis; ohne Luft, bei sehr weichem Einsatz und bei Einatmen mit Pause kein Hinweis. e2e11: Speichern, Markieren und ZIP gültig (Python `zipfile.testzip`), CSV korrekt.

## 15. Entscheidungen und bewusst Weggelassenes

- **Entfernt:** Spektrogramm (zu kompliziert), die Prüfung „Übergänge zu zackig“ (unzuverlässig) und „Anderes Wort?“ (zu viele Fehlalarme, z. B. bei „Euro“/„Hallo“). Die Keys `flux`/`word` stehen nur noch in `TITLES`.
- **Dehnungs-Zielbereich** bewusst großzügig (1,0–4,5 s), weil korrekte Logopäden-Prolongationen vorher als „keine Prolongation“ bewertet wurden.
- **Nicht gebaut** (Vorgabe): Bewertung von behauchter oder gepresster Stimme, Spracherkennung, Login, Cloud.

## 16. Grenzen und offene Punkte

- Keine echte Worterkennung; Grenzen zwischen Vokal, l, r, m, n sind unsicher.
- Lautes, gleichmäßiges Hintergrundgeräusch lässt sich nicht herausfiltern.
- Auf dem echten iPhone nur vom Nutzer selbst getestet. Der Luft-Check und das Protokoll sind bisher nur im Browser mit künstlichen Aufnahmen getestet. Offen ist, ob hörbares Einatmen direkt vor dem Wort fälschlich als Luft zählt.
- ScriptProcessorNode ist veraltet, funktioniert aber in Safari und Chrome. AudioWorklet wäre die Alternative.
