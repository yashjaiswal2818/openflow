<div align="center">
  <h3>OpenFlow · Das quelloffene, 100 % offline arbeitende Sprach-Betriebssystem</h3>
  <p><strong>Intelligentes Diktieren + Zero-Shot-Stimmklonen. Eine lokale App. Keine Cloud.</strong></p>
  <p><a href="../README.md">English</a> • <a href="README_CN.md">简体中文</a> • <a href="README_JA.md">日本語</a> • <strong>Deutsch</strong> • <a href="README_ES.md">Español</a></p>
</div>

---

## Was ist OpenFlow?

OpenFlow ersetzt zwei Abo-Dienste durch ein einziges lokales Programm:

1. **Intelligentes Diktieren (Voice-IN)** – globalen Hotkey irgendwo halten, sprechen, loslassen:
   Füllwörter, Stotterer und gesprochene Satzzeichen werden bereinigt und der Text landet
   direkt an der Cursorposition.
2. **Zero-Shot-Stimmklonen (Voice-OUT)** – einmal 5–15 Sekunden Referenzaudio aufnehmen und
   anschließend offline in der eigenen Stimme sprechen oder markierten Bildschirmtext vorlesen.

Keine Konten, keine API-Schlüssel, keine Telemetrie. Audio, Transkripte, Stimmprofile und
Modelle liegen in `~/.openflow` – Ordner löschen genügt zum vollständigen Entfernen.

## Schnellstart

Voraussetzungen: **Node.js 18+** und **Python 3.10+**.

```bash
git clone https://github.com/yashjaiswal2818/openflow.git
cd openflow
npm install
npm run dev          # Engine (127.0.0.1:18488) + Studio (localhost:1420)
```

Dann <http://localhost:1420> öffnen.

Fehlen Mikrofon-Abhängigkeiten oder Whisper, startet die Engine automatisch im **Demo-Modus**:
Aufnahme und Transkript werden simuliert, Textbereinigung, Verlauf, WAV-Archiv und
Sprachsynthese laufen echt. Die Oberfläche zeigt dauerhaft ein „demo mode“-Abzeichen und jede
API-Antwort trägt `demo: true` – nichts wird als echte Erkennung ausgegeben.

### Echte Spracherkennung aktivieren (optional)

```bash
pip install -r requirements.txt
npm run dev
```

Unter **Einstellungen → Diagnose** zeigt OpenFlow, welche Hardware und Modelle tatsächlich
erkannt wurden.

## Funktionsumfang

| Funktion | Status |
| :--- | :--- |
| Deterministische Diktat-Bereinigung (Füllwörter, Stottern, Satzzeichen, Groß-/Kleinschreibung, Akronyme) | ✅ Fertig, 20 Tests, unter 1 ms |
| Doppelte Aufbewahrung (rohe WAV + Rohtranskript + bereinigter Text) | ✅ Fertig, durchsuchbar und exportierbar |
| Stimmprofile (Browser-Aufnahme → 16-kHz-WAV → Prüfung → Tonhöhenanalyse) | ✅ Fertig |
| Offline-Sprachsynthese | ✅ Funktioniert (Vorschau-Qualität); mit Kokoro-82M neuronal |
| Globaler Hotkey + automatisches Einfügen | ✅ Implementiert (benötigt `pynput` und Clipboard-Tool) |
| Whisper-Transkription | ✅ Implementiert (faster-whisper / whisper) |
| Kokoro-82M / Piper-Adapter | ⏳ In Arbeit |
| Tauri-Desktop-Shell | ⏳ Gerüst |

## Modellstufen

| Stufe | Spracherkennung | Sprachausgabe | Ziel-Latenz | RAM |
| :--- | :--- | :--- | :--- | :--- |
| ⚡ Fast | `tiny.en` | Piper VITS | `<150 ms` | `<500 MB` |
| ⚖️ Balanced | `small.en` | Kokoro-82M | `<350 ms` | `~1.5 GB` |
| 💎 Pro Studio | `large-v3-turbo` | F5-TTS | hohe Qualität | `~4 GB` |

## Tests

```bash
npm test        # TypeScript-Typprüfung + 62 Engine-Tests
npm run build   # Produktions-Build
```

Architektur, vollständige API und Roadmap: siehe [englisches README](../README.md).

## Lizenz

[MIT](../LICENSE)
