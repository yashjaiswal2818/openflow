<div align="center">
  <h3>OpenFlow · El sistema operativo de voz local, open source y 100 % offline</h3>
  <p><strong>Dictado inteligente + clonación de voz zero-shot. Una app local. Sin nube.</strong></p>
  <p><a href="../README.md">English</a> • <a href="README_CN.md">简体中文</a> • <a href="README_JA.md">日本語</a> • <a href="README_DE.md">Deutsch</a> • <strong>Español</strong></p>
</div>

---

## ¿Qué es OpenFlow?

OpenFlow sustituye dos servicios de suscripción con un único programa local:

1. **Dictado inteligente (Voice-IN)** — mantén el atajo global en cualquier aplicación, habla y
   suelta: se eliminan las muletillas, se colapsan los tartamudeos, se convierten las comas
   dictadas y el texto aparece directamente en el cursor.
2. **Clonación de voz zero-shot (Voice-OUT)** — graba una vez 5–15 segundos de referencia y
   después sintetiza voz offline con tu timbre, o lee en voz alta el texto que selecciones.

Sin cuentas, sin claves de API y sin telemetría. El audio, las transcripciones, los perfiles de
voz y los modelos viven en `~/.openflow`; basta con borrar esa carpeta para eliminarlo todo.

## Inicio rápido

Requisitos: **Node.js 18+** y **Python 3.10+**.

```bash
git clone https://github.com/yashjaiswal2818/openflow.git
cd openflow
npm install
npm run dev          # motor (127.0.0.1:18488) + Studio (localhost:1420)
```

Abre <http://localhost:1420>.

Si faltan las dependencias de micrófono o Whisper, el motor arranca en **modo demo**: la
captura y la transcripción se simulan, pero la limpieza de texto, el historial, el archivo WAV y
la síntesis de voz son reales. La interfaz muestra siempre la insignia «demo mode» y cada
respuesta de la API incluye `demo: true`, nunca se presenta como reconocimiento real.

### Activar voz real (opcional)

```bash
pip install -r requirements.txt
npm run dev
```

En **Ajustes → Diagnóstico** se ve exactamente qué micrófono, backend de Whisper, motor de TTS
e inyección de teclado se han detectado.

## Estado actual

| Función | Estado |
| :--- | :--- |
| Limpieza determinista del dictado (muletillas, tartamudeos, puntuación hablada, mayúsculas, siglas) | Completo, 20 pruebas, <1 ms |
| Preservación doble (WAV original + transcripción cruda + texto limpio) | Completo, con búsqueda y exportación |
| Perfiles de voz (grabación en navegador → WAV 16 kHz → validación → análisis de tono) | Completo |
| Síntesis offline | Funciona (calidad de vista previa); Kokoro-82M la hace neuronal |
| Atajo global + pegado automático | Implementado (requiere `pynput` y herramienta de portapapeles) |
| Transcripción Whisper | Implementado (faster-whisper / whisper) |
| Adaptador Kokoro-82M / Piper | WIP · En curso |
| Shell de escritorio Tauri | WIP · Andamiaje |

## Niveles de modelo

| Nivel | Reconocimiento | Síntesis | Latencia objetivo | RAM |
| :--- | :--- | :--- | :--- | :--- |
| ⚡ Fast | `tiny.en` | Piper VITS | `<150 ms` | `<500 MB` |
| ⚖️ Balanced | `small.en` | Kokoro-82M | `<350 ms` | `~1.5 GB` |
| 💎 Pro Studio | `large-v3-turbo` | F5-TTS | alta fidelidad | `~4 GB` |

## Pruebas

```bash
npm test        # comprobación de tipos + 62 pruebas del motor
npm run build   # build de producción
```

Arquitectura, API completa y hoja de ruta: consulta el [README en inglés](../README.md).

## Licencia

[MIT](../LICENSE)
