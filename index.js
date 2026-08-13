// ============================================================
// 🎵 NR MUSIC — GLOBAL MUSIC BOT
// ============================================================

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActivityType
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    entersState
} = require("@discordjs/voice");

const play = require("play-dl");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

const AUTO_DISCONNECT = 5 * 60 * 1000;

if (!TOKEN) {
    console.error("❌ Falta TOKEN");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ Falta CLIENT_ID");
    process.exit(1);
}

// ============================================================
// EXPRESS / PORT
// ============================================================

const app = express();

app.disable("x-powered-by");

app.get("/", (req, res) => {
    res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NR MUSIC</title>

<style>
body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #08080c;
    color: white;
    font-family: Arial, sans-serif;
}

.card {
    width: 90%;
    max-width: 600px;
    padding: 45px;
    text-align: center;
    background: #121219;
    border: 1px solid #272735;
    border-radius: 25px;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
}

.logo {
    font-size: 65px;
}

h1 {
    font-size: 42px;
    margin: 10px 0;
}

.online {
    display: inline-block;
    padding: 8px 18px;
    border-radius: 50px;
    background: #12321e;
    color: #57f287;
    font-weight: bold;
}

p {
    color: #aaa;
}

.small {
    margin-top: 30px;
    color: #666;
    font-size: 13px;
}
</style>
</head>

<body>
<div class="card">

    <div class="logo">🎵</div>

    <h1>NR MUSIC</h1>

    <div class="online">
        ● ONLINE
    </div>

    <p>Global Discord Music Bot</p>

    <p>🎵 +10 bots en funcionamiento | /help</p>

    <div class="small">
        NR MUSIC • Global
    </div>

</div>
</body>
</html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        bot: "NR MUSIC",
        guilds: client?.guilds?.cache?.size || 0,
        uptime: Math.floor(process.uptime()),
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server iniciado en PORT ${PORT}`);
});

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================================================
// SERVIDORES DE MÚSICA
// ============================================================

const music = new Map();

/*
guildId = {

    connection,
    player,

    queue: [],
    current: null,

    volume: 100,
    loop: false,

    textChannel: null,

    emptyTimer: null

}
*/

// ============================================================
// CREAR DATOS DEL SERVIDOR
// ============================================================

function getMusic(guildId) {

    if (!music.has(guildId)) {

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber:
                    NoSubscriberBehavior.Pause
            }
        });

        const data = {
            connection: null,
            player,
            queue: [],
            current: null,
            volume: 100,
            loop: false,
            textChannel: null,
            emptyTimer: null
        };

        player.on(
            AudioPlayerStatus.Idle,
            async () => {
                await playNext(guildId);
            }
        );

        player.on(
            "error",
            async error => {

                console.error(
                    "❌ Error de audio:",
                    error
                );

                const guildMusic =
                    music.get(guildId);

                if (!guildMusic) return;

                guildMusic.current = null;

                await playNext(guildId);
            }
        );

        music.set(
            guildId,
            data
        );
    }

    return music.get(guildId);
}

// ============================================================
// EMBEDS
// ============================================================

function embed(title, description) {

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        })
        .setTimestamp();
}

function errorEmbed(description) {

    return new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ NR MUSIC")
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        })
        .setTimestamp();
}

// ============================================================
// CANAL DE VOZ DEL USUARIO
// ============================================================

function getVoiceChannel(interaction) {

    return interaction.member?.voice?.channel || null;
}

// ============================================================
// CONECTAR AL VC
// ============================================================

async function connectVoice(channel, guildId) {

    const guildMusic =
        getMusic(guildId);

    if (guildMusic.emptyTimer) {

        clearTimeout(
            guildMusic.emptyTimer
        );

        guildMusic.emptyTimer = null;
    }

    const connection =
        joinVoiceChannel({

            channelId: channel.id,

            guildId: channel.guild.id,

            adapterCreator:
                channel.guild.voiceAdapterCreator,

            selfDeaf: true,
            selfMute: false
        });

    guildMusic.connection =
        connection;

    connection.subscribe(
        guildMusic.player
    );

    try {

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            15_000
        );

    } catch (error) {

        try {
            connection.destroy();
        } catch {}

        guildMusic.connection = null;

        throw error;
    }

    connection.on(
        VoiceConnectionStatus.Disconnected,
        async () => {

            try {

                await Promise.race([

                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5_000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5_000
                    )

                ]);

            } catch {

                disconnectGuild(
                    guildId,
                    true
                );
            }
        }
    );

    return connection;
}

// ============================================================
// DESCONECTAR
// ============================================================

function disconnectGuild(
    guildId,
    clearQueue = true
) {

    const guildMusic =
        music.get(guildId);

    if (!guildMusic) return;

    if (guildMusic.emptyTimer) {

        clearTimeout(
            guildMusic.emptyTimer
        );

        guildMusic.emptyTimer = null;
    }

    try {
        guildMusic.player.stop(true);
    } catch {}

    if (guildMusic.connection) {

        try {
            guildMusic.connection.destroy();
        } catch {}
    }

    guildMusic.connection = null;
    guildMusic.current = null;

    if (clearQueue) {
        guildMusic.queue = [];
    }
}

// ============================================================
// BUSCAR EN YOUTUBE
// ============================================================

async function searchYouTube(query) {

    try {

        // URL directa
        const validation =
            play.yt_validate(query);

        if (validation === "video") {

            const info =
                await play.video_basic_info(
                    query
                );

            const video =
                info.video_details;

            return {
                title: video.title,
                url: video.url,
                duration: video.durationRaw,
                thumbnail:
                    video.thumbnails?.[0]?.url ||
                    null
            };
        }

        // Búsqueda
        const results =
            await play.search(
                query,
                {
                    limit: 1,
                    source: {
                        youtube: "video"
                    }
                }
            );

        if (!results.length) {
            return null;
        }

        const video =
            results[0];

        return {
            title: video.title,
            url: video.url,
            duration: video.durationRaw,
            thumbnail:
                video.thumbnails?.[0]?.url ||
                null
        };

    } catch (error) {

        console.error(
            "❌ Error buscando YouTube:",
            error
        );

        return null;
    }
}

// ============================================================
// REPRODUCIR
// ============================================================

async function playSong(song, guildId) {

    const guildMusic =
        getMusic(guildId);

    try {

        const stream =
            await play.stream(
                song.url,
                {
                    quality: 2,
                    discordPlayerCompatibility: true
                }
            );

        const resource =
            createAudioResource(
                stream.stream,
                {
                    inputType: stream.type,
                    inlineVolume: true
                }
            );

        if (resource.volume) {

            resource.volume.setVolume(
                guildMusic.volume / 100
            );
        }

        guildMusic.player.play(
            resource
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Error reproduciendo:",
            error
        );

        return false;
    }
}

// ============================================================
// SIGUIENTE CANCIÓN
// ============================================================

async function playNext(guildId) {

    const guildMusic =
        music.get(guildId);

    if (!guildMusic) return;

    // LOOP
    if (
        guildMusic.loop &&
        guildMusic.current
    ) {

        const success =
            await playSong(
                guildMusic.current,
                guildId
            );

        if (!success) {

            guildMusic.current = null;
            guildMusic.loop = false;

            await playNext(guildId);
        }

        return;
    }

    // COLA VACÍA
    if (
        guildMusic.queue.length === 0
    ) {

        guildMusic.current = null;

        return;
    }

    // SACAR SIGUIENTE
    const song =
        guildMusic.queue.shift();

    guildMusic.current =
        song;

    const success =
        await playSong(
            song,
            guildId
        );

    if (!success) {

        guildMusic.current = null;

        if (guildMusic.textChannel) {

            guildMusic.textChannel.send({

                embeds: [

                    errorEmbed(
                        `No pude reproducir **${song.title}**. Pasando a la siguiente...`
                    )

                ]

            }).catch(() => {});
        }

        await playNext(guildId);

        return;
    }

    if (guildMusic.textChannel) {

        const now =
            embed(
                "🎶 Reproduciendo ahora",
                `**${song.title}**`
            );

        if (song.thumbnail) {
            now.setThumbnail(
                song.thumbnail
            );
        }

        guildMusic.textChannel.send({

            embeds: [now]

        }).catch(() => {});
    }
}

// ============================================================
// AUTO-DISCONNECT
// ============================================================

function checkEmpty(guild) {

    const guildMusic =
        music.get(guild.id);

    if (
        !guildMusic ||
        !guildMusic.connection
    ) {
        return;
    }

    const bot =
        guild.members.me;

    if (!bot?.voice?.channel) {
        return;
    }

    const channel =
        bot.voice.channel;

    const humans =
        channel.members.filter(
            member =>
                !member.user.bot
        );

    // Hay usuarios
    if (humans.size > 0) {

        if (guildMusic.emptyTimer) {

            clearTimeout(
                guildMusic.emptyTimer
            );

            guildMusic.emptyTimer = null;
        }

        return;
    }

    // Ya hay timer
    if (guildMusic.emptyTimer) {
        return;
    }

    guildMusic.emptyTimer =
        setTimeout(
            () => {

                const current =
                    music.get(
                        guild.id
                    );

                if (
                    !current?.connection
                ) {
                    return;
                }

                const currentChannel =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!currentChannel) {

                    disconnectGuild(
                        guild.id,
                        true
                    );

                    return;
                }

                const users =
                    currentChannel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

                    console.log(
                        `🚪 ${guild.name}: desconexión automática.`
                    );

                    disconnectGuild(
                        guild.id,
                        true
                    );
                }

            },
            AUTO_DISCONNECT
        );
}

// ============================================================
// VOICE STATE
// ============================================================

client.on(
    "voiceStateUpdate",
    (oldState, newState) => {

        const guild =
            newState.guild ||
            oldState.guild;

        checkEmpty(guild);
    }
);

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "🎧 Entra a tu canal de voz."
        ),

    new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "🎵 Busca y reproduce una canción de YouTube."
        )
        .addStringOption(
            option =>
                option
                    .setName("cancion")
                    .setDescription(
                        "Nombre o URL de YouTube."
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription(
            "⏸️ Pausa la canción."
        ),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "▶️ Reanuda la canción."
        ),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription(
            "⏭️ Salta la canción."
        ),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "🛑 Detiene todo y sale del VC."
        ),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription(
            "📋 Muestra la cola."
        ),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription(
            "🎶 Muestra lo que está sonando."
        ),

    new SlashCommandBuilder()
        .setName("volume")
        .setDescription(
            "🔊 Cambia el volumen."
        )
        .addIntegerOption(
            option =>
                option
                    .setName("nivel")
                    .setDescription(
                        "1 - 100"
                    )
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "🔁 Activa o desactiva el loop."
        ),

    new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription(
            "🔀 Mezcla la cola."
        ),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription(
            "🗑️ Elimina una canción."
        )
        .addIntegerOption(
            option =>
                option
                    .setName("posicion")
                    .setDescription(
                        "Posición en la cola."
                    )
                    .setMinValue(1)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription(
            "🧹 Limpia la cola."
        ),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription(
            "🚪 Desconecta el bot."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Muestra todos los comandos."
        )

].map(command => command.toJSON());

// ============================================================
// REGISTRAR GLOBALMENTE
// ============================================================

async function registerCommands() {

    const rest =
        new REST({
            version: "10"
        }).setToken(
            TOKEN
        );

    try {

        console.log(
            "🌎 Registrando comandos globales..."
        );

        await rest.put(
            Routes.applicationCommands(
                CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log(
            "✅ Comandos globales registrados."
        );

    } catch (error) {

        console.error(
            "❌ Error registrando comandos:",
            error
        );
    }
}

// ============================================================
// INTERACCIONES
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        if (!interaction.guild) {

            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Este comando solo funciona dentro de un servidor."
                    )
                ],
                ephemeral: true
            });
        }

        const guild =
            interaction.guild;

        const guildId =
            guild.id;

        const command =
            interaction.commandName;

        // ====================================================
        // JOIN
        // ====================================================

        if (command === "join") {

            const voice =
                getVoiceChannel(
                    interaction
                );

            if (!voice) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "🎧 Primero entra a un canal de voz."
                        )
                    ],
                    ephemeral: true
                });
            }

            try {

                const guildMusic =
                    getMusic(guildId);

                if (
                    guildMusic.connection &&
                    guild.members.me
                        ?.voice
                        ?.channelId === voice.id
                ) {

                    return interaction.reply({
                        embeds: [
                            embed(
                                "🎧 Ya estoy conectado",
                                `Ya estoy en **${voice.name}**.`
                            )
                        ],
                        ephemeral: true
                    });
                }

                await connectVoice(
                    voice,
                    guildId
                );

                guildMusic.textChannel =
                    interaction.channel;

                return interaction.reply({
                    embeds: [
                        embed(
                            "🎧 Conectado",
                            `Entré a **${voice.name}**.`
                        )
                    ]
                });

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No pude conectarme al canal de voz."
                        )
                    ],
                    ephemeral: true
                });
            }
        }

        // ====================================================
        // PLAY
        // ====================================================

        if (command === "play") {

            const voice =
                getVoiceChannel(
                    interaction
                );

            if (!voice) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "🎧 Debes estar en un canal de voz."
                        )
                    ],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const guildMusic =
                getMusic(guildId);

            try {

                // Auto-join
                if (!guildMusic.connection) {

                    await connectVoice(
                        voice,
                        guildId
                    );

                }

                // Comprobar canal
                else if (
                    guild.members.me
                        ?.voice
                        ?.channelId !== voice.id
                ) {

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Debes estar en el mismo canal de voz que NR MUSIC."
                            )
                        ]
                    });
                }

                guildMusic.textChannel =
                    interaction.channel;

                const query =
                    interaction.options.getString(
                        "cancion"
                    );

                // Buscar
                const song =
                    await searchYouTube(
                        query
                    );

                if (!song) {

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "🔎 No encontré esa canción en YouTube."
                            )
                        ]
                    });
                }

                // ¿Hay canción?
                const playing =
                    guildMusic.current &&
                    (
                        guildMusic.player.state.status ===
                        AudioPlayerStatus.Playing ||

                        guildMusic.player.state.status ===
                        AudioPlayerStatus.Paused
                    );

                // =================================================
                // AÑADIR A COLA
                // =================================================

                if (playing) {

                    guildMusic.queue.push(
                        song
                    );

                    const position =
                        guildMusic.queue.length;

                    return interaction.editReply({
                        embeds: [
                            embed(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n\n` +
                                `📍 Posición: **#${position}**`
                            )
                        ]
                    });
                }

                // =================================================
                // REPRODUCIR INMEDIATAMENTE
                // =================================================

                guildMusic.current =
                    song;

                const success =
                    await playSong(
                        song,
                        guildId
                    );

                if (!success) {

                    guildMusic.current =
                        null;

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "❌ Encontré la canción, pero no pude obtener el audio."
                            )
                        ]
                    });
                }

                const now =
                    embed(
                        "🎶 Reproduciendo ahora",
                        `**${song.title}**\n\n` +
                        `📺 Fuente: YouTube`
                    );

                if (song.thumbnail) {

                    now.setThumbnail(
                        song.thumbnail
                    );
                }

                return interaction.editReply({
                    embeds: [now]
                });

            } catch (error) {

                console.error(
                    "❌ PLAY:",
                    error
                );

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Ocurrió un error al procesar la canción."
                        )
                    ]
                });
            }
        }

        // ====================================================
        // PAUSE
        // ====================================================

        if (command === "pause") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción sonando."
                        )
                    ],
                    ephemeral: true
                });
            }

            data.player.pause();

            return interaction.reply({
                embeds: [
                    embed(
                        "⏸️ Pausado",
                        `**${data.current.title}**`
                    )
                ]
            });
        }

        // ====================================================
        // RESUME
        // ====================================================

        if (command === "resume") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción para reanudar."
                        )
                    ],
                    ephemeral: true
                });
            }

            data.player.unpause();

            return interaction.reply({
                embeds: [
                    embed(
                        "▶️ Reanudado",
                        `**${data.current.title}**`
                    )
                ]
            });
        }

        // ====================================================
        // SKIP
        // ====================================================

        if (command === "skip") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción sonando."
                        )
                    ],
                    ephemeral: true
                });
            }

            data.player.stop();

            return interaction.reply({
                embeds: [
                    embed(
                        "⏭️ Saltada",
                        "Buscando la siguiente canción de la cola..."
                    )
                ]
            });
        }

        // ====================================================
        // STOP
        // ====================================================

        if (command === "stop") {

            const data =
                music.get(guildId);

            if (!data?.connection) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "NR MUSIC no está conectado."
                        )
                    ],
                    ephemeral: true
                });
            }

            disconnectGuild(
                guildId,
                true
            );

            return interaction.reply({
                embeds: [
                    embed(
                        "🛑 Detenido",
                        "Se detuvo la música, se limpió la cola y NR MUSIC salió del VC."
                    )
                ]
            });
        }

        // ====================================================
        // QUEUE
        // ====================================================

        if (command === "queue") {

            const data =
                music.get(guildId);

            if (
                !data ||
                (
                    !data.current &&
                    data.queue.length === 0
                )
            ) {

                return interaction.reply({
                    embeds: [
                        embed(
                            "📋 Cola vacía",
                            "No hay canciones en la cola."
                        )
                    ]
                });
            }

            let text = "";

            if (data.current) {

                text +=
                    `🎶 **Ahora:** ${data.current.title}\n\n`;
            }

            if (data.queue.length) {

                text +=
                    "**📋 Próximas canciones:**\n\n";

                data.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            text +=
                                `\`${index + 1}.\` ${song.title}\n`;
                        }
                    );

                if (data.queue.length > 20) {

                    text +=
                        `\n... y **${data.queue.length - 20}** más.`;
                }
            }

            return interaction.reply({
                embeds: [
                    embed(
                        "📋 Cola de NR MUSIC",
                        text
                    )
                ]
            });
        }

        // ====================================================
        // NOW PLAYING
        // ====================================================

        if (command === "nowplaying") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción sonando."
                        )
                    ],
                    ephemeral: true
                });
            }

            const status =
                data.player.state.status;

            const message =
                embed(
                    "🎶 Ahora reproduciendo",
                    `**${data.current.title}**\n\n` +
                    `🔊 Volumen: **${data.volume}%**\n` +
                    `🔁 Loop: **${data.loop ? "Activado" : "Desactivado"}**\n` +
                    `▶️ Estado: **${
                        status === AudioPlayerStatus.Paused
                            ? "Pausado"
                            : "Reproduciendo"
                    }**`
                );

            if (data.current.thumbnail) {

                message.setThumbnail(
                    data.current.thumbnail
                );
            }

            return interaction.reply({
                embeds: [message]
            });
        }

        // ====================================================
        // VOLUME
        // ====================================================

        if (command === "volume") {

            const level =
                interaction.options.getInteger(
                    "nivel"
                );

            const data =
                getMusic(guildId);

            data.volume =
                level;

            return interaction.reply({
                embeds: [
                    embed(
                        "🔊 Volumen",
                        `Volumen establecido en **${level}%**.`
                    )
                ]
            });
        }

        // ====================================================
        // LOOP
        // ====================================================

        if (command === "loop") {

            const data =
                getMusic(guildId);

            data.loop =
                !data.loop;

            return interaction.reply({
                embeds: [
                    embed(
                        data.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",

                        data.loop
                            ? "La canción actual se repetirá."
                            : "La repetición está desactivada."
                    )
                ]
            });
        }

        // ====================================================
        // SHUFFLE
        // ====================================================

        if (command === "shuffle") {

            const data =
                music.get(guildId);

            if (
                !data ||
                data.queue.length < 2
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Necesitas al menos 2 canciones en la cola."
                        )
                    ],
                    ephemeral: true
                });
            }

            for (
                let i = data.queue.length - 1;
                i > 0;
                i--
            ) {

                const j =
                    Math.floor(
                        Math.random() * (i + 1)
                    );

                [
                    data.queue[i],
                    data.queue[j]
                ] = [
                    data.queue[j],
                    data.queue[i]
                ];
            }

            return interaction.reply({
                embeds: [
                    embed(
                        "🔀 Cola mezclada",
                        "Se mezcló correctamente la cola."
                    )
                ]
            });
        }

        // ====================================================
        // REMOVE
        // ====================================================

        if (command === "remove") {

            const position =
                interaction.options.getInteger(
                    "posicion"
                );

            const data =
                music.get(guildId);

            if (
                !data ||
                data.queue.length === 0
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "La cola está vacía."
                        )
                    ],
                    ephemeral: true
                });
            }

            if (
                position < 1 ||
                position > data.queue.length
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            `La posición debe ser entre **1** y **${data.queue.length}**.`
                        )
                    ],
                    ephemeral: true
                });
            }

            const removed =
                data.queue.splice(
                    position - 1,
                    1
                )[0];

            return interaction.reply({
                embeds: [
                    embed(
                        "🗑️ Eliminada",
                        `Se eliminó **${removed.title}** de la cola.`
                    )
                ]
            });
        }

        // ====================================================
        // CLEAR
        // ====================================================

        if (command === "clear") {

            const data =
                music.get(guildId);

            if (
                !data ||
                data.queue.length === 0
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "La cola ya está vacía."
                        )
                    ],
                    ephemeral: true
                });
            }

            const amount =
                data.queue.length;

            data.queue = [];

            return interaction.reply({
                embeds: [
                    embed(
                        "🧹 Cola limpiada",
                        `Se eliminaron **${amount} canciones**.`
                    )
                ]
            });
        }

        // ====================================================
        // DISCONNECT
        // ====================================================

        if (command === "disconnect") {

            const data =
                music.get(guildId);

            if (!data?.connection) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "NR MUSIC no está conectado al VC."
                        )
                    ],
                    ephemeral: true
                });
            }

            disconnectGuild(
                guildId,
                false
            );

            return interaction.reply({
                embeds: [
                    embed(
                        "🚪 Desconectado",
                        "NR MUSIC salió del canal de voz."
                    )
                ]
            });
        }

        // ====================================================
        // HELP
        // ====================================================

        if (command === "help") {

            const help =
                new EmbedBuilder()

                    .setColor(0x5865F2)

                    .setTitle(
                        "🎵 NR MUSIC"
                    )

                    .setDescription(
                        "Sistema global de música para Discord.\n\n" +
                        "Usa `/play` para buscar canciones en YouTube."
                    )

                    .addFields(

                        {
                            name: "🎧 VOZ",
                            value:
                                "`/join` — Entrar al VC.\n" +
                                "`/disconnect` — Salir del VC.\n" +
                                "`/stop` — Detener y salir."
                        },

                        {
                            name: "🎵 MÚSICA",
                            value:
                                "`/play <canción>` — Buscar y reproducir.\n" +
                                "`/pause` — Pausar.\n" +
                                "`/resume` — Reanudar.\n" +
                                "`/skip` — Siguiente."
                        },

                        {
                            name: "📋 COLA",
                            value:
                                "`/queue` — Ver cola.\n" +
                                "`/nowplaying` — Canción actual.\n" +
                                "`/remove <posición>` — Eliminar.\n" +
                                "`/clear` — Vaciar.\n" +
                                "`/shuffle` — Mezclar."
                        },

                        {
                            name: "⚙️ CONTROL",
                            value:
                                "`/volume <1-100>` — Volumen.\n" +
                                "`/loop` — Repetir."
                        },

                        {
                            name: "🔴 PRESENCIA",
                            value:
                                "DND\n" +
                                "🎵 +10 bots en funcionamiento | /help"
                        }

                    )

                    .setFooter({
                        text:
                            "NR MUSIC • Global"
                    })

                    .setTimestamp();

            return interaction.reply({
                embeds: [help]
            });
        }
    }
);

// ============================================================
// READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            "======================================"
        );

        console.log(
            "🎵 NR MUSIC ONLINE"
        );

        console.log(
            `🤖 ${client.user.tag}`
        );

        console.log(
            `🌎 Servidores: ${client.guilds.cache.size}`
        );

        console.log(
            `🌐 PORT: ${PORT}`
        );

        console.log(
            "🔴 DND"
        );

        console.log(
            "🎵 +10 bots en funcionamiento | /help"
        );

        console.log(
            "======================================"
        );

        client.user.setPresence({

            status: "dnd",

            activities: [
                {
                    name:
                        "+10 bots en funcionamiento | /help",

                    type:
                        ActivityType.Custom
                }
            ]
        });

        await registerCommands();
    }
);

// ============================================================
// ERRORES
// ============================================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught Exception:",
            error
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);
