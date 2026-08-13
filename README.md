🤖 NR INVITE

Advanced Discord Invitation System

NR INVITE es un bot avanzado para Discord diseñado para gestionar, rastrear y mostrar estadísticas de invitaciones de servidores.

✨ Características

- 🔗 Tracking de invitaciones
- 📊 Estadísticas de invitaciones
- 🏆 Leaderboard de invitadores
- 👥 Detección de quién invitó a cada miembro
- 🚪 Detección de miembros que abandonan
- 💬 Mensajes de bienvenida personalizados
- ⚙️ Panel de configuración mediante "/setup invite"
- 🟢 Activar y desactivar el sistema
- 👁️ Vista previa del mensaje
- 📢 Canal configurable para los mensajes
- 🔧 Variables personalizadas
- 🔴 Presencia permanente en DND
- 🌐 Servidor Express para mantener el servicio activo
- 🚫 Sin Dashboard
- 🚫 Sin base de datos externa

📋 Comandos

"/help"

Muestra la información y guía de NR INVITE.

"/setup invite"

Abre el panel de configuración del sistema de invitaciones.

Permite:

- Configurar el canal
- Personalizar el mensaje
- Ver una vista previa
- Activar el sistema
- Desactivar el sistema
- Restablecer la configuración

"/active invites"

Activa el sistema de invitaciones.

"/invites"

Muestra las estadísticas de invitaciones de un usuario.

Ejemplo:

"/invites usuario:@Usuario"

"/leaderboard"

Muestra el TOP 10 de usuarios con más invitaciones activas.

🔧 Variables disponibles

Puedes utilizar estas variables en el mensaje personalizado:

@user
@inviter
{invites}
{server}
{memberCount}

Ejemplo

🎉 ¡Bienvenido/a @user a **{server}**!

🔗 Invitado por: @inviter
📊 @inviter ahora tiene **{invites}** invitaciones.
👥 Somos **{memberCount}** miembros.

📁 Estructura

NR-INVITE/
├── index.js
├── package.json
├── .gitignore
└── README.md

🚀 Instalación

Clona el repositorio:

git clone TU_REPOSITORIO
cd NR-INVITE

Instala las dependencias:

npm install

Configura el token del bot mediante una variable de entorno:

TOKEN=TU_TOKEN

Inicia el bot:

npm start

🔐 Permisos e Intents

NR INVITE utiliza:

- "Guilds"
- "GuildMembers"
- "GuildInvites"

El bot necesita permisos suficientes para consultar las invitaciones del servidor y enviar mensajes en el canal configurado.

🌐 Express

El bot incluye un servidor Express.

"/"

Devuelve el estado básico del servicio.

"/status"

Devuelve información como:

- Estado del bot
- Estado DND
- Cantidad de servidores
- Uptime
- Red de bots

"/health"

Endpoint utilizado para comprobar que Express está funcionando correctamente.

💾 Almacenamiento

NR INVITE no utiliza SQLite ni una base de datos externa.

La configuración se mantiene en memoria mediante "Map".

⚠️ Al reiniciar el bot, las configuraciones y estadísticas almacenadas en memoria se perderán.

🔒 Seguridad

Nunca publiques tu token de Discord en GitHub.

Utiliza una variable de entorno:

TOKEN=TU_TOKEN

Y mantén ".env" fuera del repositorio mediante ".gitignore".

🆘 Soporte

Servidor oficial de soporte:

https://discord.gg/PZw45tHPfc

🤖 NR NETWORK

Más de 10 bots en funcionamiento.

Presencia del bot:

"Más de 10 bots en funcionamiento | /help"

Estado:

"DND"

---

📜 Licencia

Proyecto privado de NR NETWORK.

No redistribuir ni modificar para uso comercial sin autorización del propietario.
