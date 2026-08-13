# 🎵 NR MUSIC

Bot de música profesional para Discord.

NR MUSIC permite reproducir canciones, administrar colas y controlar la reproducción directamente desde comandos Slash.

## 🚀 Características

- 🎧 Conexión a canales de voz
- 🎵 Reproducción de canciones
- 📋 Sistema de cola
- ⏯️ Pausar y reanudar
- ⏭️ Saltar canciones
- 🔊 Control de volumen
- 🔁 Modo repetición
- 🔀 Mezcla de cola
- 🗑️ Eliminación individual de canciones
- 🧹 Limpieza de cola
- 🎶 Información de la canción actual
- 🚪 Desconexión del canal de voz
- 🤖 Desconexión automática cuando el bot queda solo
- 🔴 Estado DND permanente

## 📌 Comandos

### 🎧 Conexión

`/join`
Entra al canal de voz donde estás.

`/disconnect`
Desconecta NR MUSIC del canal de voz.

`/stop`
Detiene la música, limpia la cola y desconecta el bot.

### 🎵 Música

`/play <canción>`
Busca y reproduce una canción.

`/pause`
Pausa la canción actual.

`/resume`
Reanuda la reproducción.

`/skip`
Salta a la siguiente canción.

### 📋 Cola

`/queue`
Muestra las canciones pendientes.

`/nowplaying`
Muestra la canción que está sonando.

`/remove <posición>`
Elimina una canción específica de la cola.

`/clear`
Limpia toda la cola.

`/shuffle`
Mezcla las canciones de la cola.

### ⚙️ Control

`/volume <1-100>`
Cambia el volumen.

`/loop`
Activa o desactiva la repetición.

### 📚 Ayuda

`/help`
Muestra todos los comandos disponibles.

## 🔴 Estado del bot

NR MUSIC utiliza permanentemente:

**Estado:** DND

**Actividad:**
`🎵 +10 bots en funcionamiento | /help`

## 🛠️ Instalación

### 1. Instalar Node.js

Se recomienda Node.js 20 o superior.

### 2. Instalar dependencias

```bash
npm install
