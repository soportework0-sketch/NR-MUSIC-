// ============================================================
// 🎵 NR MUSIC — GLOBAL
// Discord Music Bot
// ============================================================

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActivityType
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior,
    entersState
} = require("@discordjs/voice");

const play = require("play-dl");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

const EMPTY_CHANNEL_TIMEOUT = 5 * 60 * 1000;

// ============================================================
// VALIDACIÓN
// ============================================================

if (!TOKEN) {
    console.error("❌ ERROR: Falta TOKEN.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ ERROR: Falta CLIENT_ID.");
    process.exit(1);
}

// ============================================================
// WEB SERVER / PORT
// ============================================================

const app = express();

app.disable("x-powered-by");

app.get("/", (req, res) => {
    res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NR MUSIC</title>

<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #08080c;
    color: white;
    font-family: Arial, sans-serif;
}

.container {
    width: min(90%, 600px);
    padding: 45px;
    text-align: center;
    background: #121219;
    border: 1px solid #242432;
    border-radius: 24px;
}

.logo {
    font-size: 55px;
}

h1 {
    margin: 10px 0;
    font-size: 40px;
}

.status {
    display: inline-block;
    margin-top: 10px;
    padding: 8px 16px;
    border-radius: 999px;
    background: #142b1d;
    color: #57f287;
    font-weight: bold;
}

p {
    color: #aaa;
}

.footer {
    margin-top: 30px;
    font-size: 13px;
    color: #666;
}
</style>
</head>

<body>

<div class="container">

    <div class="logo">🎵</div>

    <h1>NR MUSIC</h1>

    <div class="status">
        ● ONLINE
    </div>

    <p>
        Global Discord Music Bot
    </p>

    <p>
        🎵 +10 bots en funcionamiento | /help
    </p>

    <div class="footer">
        NR MUSIC • 2026
    </div>

</div>

</body>
</html>
    `);
});

app.get("/health", (req, res) => {

    res.status(200).json({
        status: "online",
        bot: "NR MUSIC",
        version: "1.0.0",
        uptime: Math.floor(process.uptime()),
        servers: client ? client.guilds.cache.size : 0,
        timestamp: new Date().toISOString()
    });

});

app.listen(PORT, () => {

    console.log(
        `🌐 NR MUSIC Web Server iniciado en puerto ${PORT}`
    );

});

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ],

    partials: [
        Partials.Channel
    ]

});

// ============================================================
// MUSIC MANAGER
// ============================================================

const music = new Map();

/*
guildId => {

    connection,
    player,

    queue: [],

    current: null,

    volume: 100,

    loop: false,

    emptyTimer: null,

    textChannel: null

}
*/

// ============================================================
// GET MUSIC DATA
// ============================================================

function getGuildMusic(guildId) {

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

            emptyTimer: null,

            textChannel: null

        };

        // ----------------------------------------------------
        // PLAYER IDLE
        // ----------------------------------------------------

        player.on(
            AudioPlayerStatus.Idle,
            async () => {

                await playNext(guildId);

            }
        );

        // ----------------------------------------------------
        // PLAYER ERROR
        // ----------------------------------------------------

        player.on(
            "error",
            async error => {

                console.error(
                    "❌ Audio Error:",
                    error
                );

                const guildMusic =
                    music.get(guildId);

                if (!guildMusic) {
                    return;
                }

                guildMusic.current = null;

                if (guildMusic.textChannel) {

                    guildMusic.textChannel.send({

                        embeds: [

                            createErrorEmbed(
                                "No se pudo reproducir la canción. Pasando a la siguiente..."
                            )

                        ]

                    }).catch(() => {});

                }

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

function createEmbed(
    title,
    description
) {

    return new EmbedBuilder()

        .setColor(0x5865F2)

        .setTitle(title)

        .setDescription(description)

        .setFooter({
            text: "🎵 NR MUSIC"
        })

        .setTimestamp();

}

function createErrorEmbed(
    description
) {

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
// USER VOICE CHANNEL
// ============================================================

function getUserVoiceChannel(
    interaction
) {

    return interaction.member?.voice?.channel || null;

}

// ============================================================
// CONNECT
// ============================================================

async function connectToVoice(
    channel,
    guildId
) {

    const guildMusic =
        getGuildMusic(guildId);

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

    connection.on(
        VoiceConnectionStatus.Disconnected,
        async () => {

            try {

                await Promise.race([

                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5000
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
// DISCONNECT
// ============================================================

function disconnectGuild(
    guildId,
    clearQueue = true
) {

    const guildMusic =
        music.get(guildId);

    if (!guildMusic) {
        return;
    }

    if (guildMusic.emptyTimer) {

        clearTimeout(
            guildMusic.emptyTimer
        );

        guildMusic.emptyTimer = null;

    }

    try {

        guildMusic.player.stop(
            true
        );

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
// SEARCH SONG
// ============================================================

async function searchSong(
    query
) {

    try {

        const validation =
            play.yt_validate(query);

        // ----------------------------------------------------
        // DIRECT VIDEO URL
        // ----------------------------------------------------

        if (validation === "video") {

            const info =
                await play.video_basic_info(
                    query
                );

            const details =
                info.video_details;

            return {

                title:
                    details.title,

                url:
                    details.url,

                duration:
                    details.durationRaw,

                thumbnail:
                    details.thumbnails?.[0]?.url || null

            };

        }

        // ----------------------------------------------------
        // SEARCH
        // ----------------------------------------------------

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

            title:
                video.title,

            url:
                video.url,

            duration:
                video.durationRaw,

            thumbnail:
                video.thumbnails?.[0]?.url || null

        };

    } catch (error) {

        console.error(
            "❌ Search Error:",
            error
        );

        return null;

    }

}

// ============================================================
// PLAY SONG
// ============================================================

async function playSong(
    song,
    guildId
) {

    const guildMusic =
        getGuildMusic(guildId);

    try {

        const stream =
            await play.stream(
                song.url,
                {
                    quality: 2,

                    discordPlayerCompatibility:
                        true
                }
            );

        const resource =
            createAudioResource(
                stream.stream,
                {
                    inputType:
                        stream.type,

                    inlineVolume:
                        true
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
            "❌ Play Error:",
            error
        );

        return false;

    }

}

// ============================================================
// NEXT SONG
// ============================================================

async function playNext(
    guildId
) {

    const guildMusic =
        music.get(guildId);

    if (!guildMusic) {
        return;
    }

    // --------------------------------------------------------
    // LOOP
    // --------------------------------------------------------

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

            guildMusic.loop =
                false;

            guildMusic.current =
                null;

            await playNext(
                guildId
            );

        }

        return;

    }

    // --------------------------------------------------------
    // QUEUE EMPTY
    // --------------------------------------------------------

    if (
        guildMusic.queue.length === 0
    ) {

        guildMusic.current =
            null;

        return;

    }

    // --------------------------------------------------------
    // NEXT
    // --------------------------------------------------------

    const next =
        guildMusic.queue.shift();

    guildMusic.current =
        next;

    const success =
        await playSong(
            next,
            guildId
        );

    if (!success) {

        guildMusic.current =
            null;

        if (
            guildMusic.textChannel
        ) {

            guildMusic.textChannel.send({

                embeds: [

                    createErrorEmbed(
                        `No pude reproducir **${next.title}**.`
                    )

                ]

            }).catch(() => {});

        }

        await playNext(
            guildId
        );

        return;

    }

    if (
        guildMusic.textChannel
    ) {

        const embed =
            createEmbed(
                "🎶 Reproduciendo ahora",
                `**${next.title}**`
            );

        if (
            next.thumbnail
        ) {

            embed.setThumbnail(
                next.thumbnail
            );

        }

        guildMusic.textChannel.send({

            embeds: [
                embed
            ]

        }).catch(() => {});

    }

}

// ============================================================
// AUTO DISCONNECT
// ============================================================

function checkEmptyVoice(
    guild
) {

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

    if (
        !bot ||
        !bot.voice.channel
    ) {
        return;
    }

    const channel =
        bot.voice.channel;

    const humans =
        channel.members.filter(
            member =>
                !member.user.bot
        );

    // --------------------------------------------------------
    // USERS PRESENT
    // --------------------------------------------------------

    if (
        humans.size > 0
    ) {

        if (
            guildMusic.emptyTimer
        ) {

            clearTimeout(
                guildMusic.emptyTimer
            );

            guildMusic.emptyTimer =
                null;

        }

        return;

    }

    // --------------------------------------------------------
    // TIMER ALREADY EXISTS
    // --------------------------------------------------------

    if (
        guildMusic.emptyTimer
    ) {
        return;
    }

    console.log(
        `⚠️ ${guild.name}: NR MUSIC está solo.`
    );

    guildMusic.emptyTimer =
        setTimeout(
            () => {

                const current =
                    music.get(
                        guild.id
                    );

                if (
                    !current ||
                    !current.connection
                ) {
                    return;
                }

                const botChannel =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!botChannel) {

                    disconnectGuild(
                        guild.id,
                        true
                    );

                    return;

                }

                const users =
                    botChannel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (
                    users.size === 0
                ) {

                    console.log(
                        `🚪 ${guild.name}: NR MUSIC desconectado automáticamente.`
                    );

                    disconnectGuild(
                        guild.id,
                        true
                    );

                }

            },
            EMPTY_CHANNEL_TIMEOUT
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

        checkEmptyVoice(
            guild
        );

    }
);

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "🎧 Entra al canal de voz donde estás."
        ),

    new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "🎵 Reproduce una canción."
        )
        .addStringOption(
            option =>
                option
                    .setName("cancion")
                    .setDescription(
                        "Nombre o URL de la canción."
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription(
            "⏸️ Pausa la reproducción."
        ),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "▶️ Reanuda la reproducción."
        ),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription(
            "⏭️ Salta la canción actual."
        ),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "🛑 Detiene todo y desconecta."
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
                        "Volumen entre 1 y 100."
                    )
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "🔁 Activa o desactiva repetición."
        ),

    new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription(
            "🔀 Mezcla la cola."
        ),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription(
            "🗑️ Elimina una canción de la cola."
        )
        .addIntegerOption(
            option =>
                option
                    .setName("posicion")
                    .setDescription(
                        "Posición de la canción."
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
            "🚪 Saca al bot del canal de voz."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Muestra los comandos de NR MUSIC."
        )

].map(
    command =>
        command.toJSON()
);

// ============================================================
// REGISTER GLOBAL COMMANDS
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
// INTERACTIONS
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        if (
            !interaction.guild
        ) {

            return interaction.reply({

                embeds: [

                    createErrorEmbed(
                        "Este comando solamente funciona dentro de un servidor."
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

        if (
            command === "join"
        ) {

            const voiceChannel =
                getUserVoiceChannel(
                    interaction
                );

            if (!voiceChannel) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "🎧 Debes estar conectado a un canal de voz."
                        )

                    ],

                    ephemeral: true

                });

            }

            const guildMusic =
                getGuildMusic(
                    guildId
                );

            try {

                if (
                    guildMusic.connection &&
                    guild.members.me
                        ?.voice
                        ?.channelId ===
                    voiceChannel.id
                ) {

                    return interaction.reply({

                        embeds: [

                            createEmbed(
                                "🎧 Ya estoy conectado",
                                `NR MUSIC ya está en **${voiceChannel.name}**.`
                            )

                        ],

                        ephemeral: true

                    });

                }

                await connectToVoice(
                    voiceChannel,
                    guildId
                );

                guildMusic.textChannel =
                    interaction.channel;

                return interaction.reply({

                    embeds: [

                        createEmbed(
                            "🎧 Conectado",
                            `NR MUSIC entró a **${voiceChannel.name}**.`
                        )

                    ]

                });

            } catch (error) {

                console.error(
                    error
                );

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
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

        if (
            command === "play"
        ) {

            const voiceChannel =
                getUserVoiceChannel(
                    interaction
                );

            if (!voiceChannel) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "🎧 Debes estar en un canal de voz."
                        )

                    ],

                    ephemeral: true

                });

            }

            const guildMusic =
                getGuildMusic(
                    guildId
                );

            await interaction.deferReply();

            try {

                // --------------------------------------------
                // AUTO JOIN
                // --------------------------------------------

                if (
                    !guildMusic.connection
                ) {

                    await connectToVoice(
                        voiceChannel,
                        guildId
                    );

                }

                // --------------------------------------------
                // SAME CHANNEL
                // --------------------------------------------

                else if (
                    guild.members.me
                        ?.voice
                        ?.channelId !==
                    voiceChannel.id
                ) {

                    return interaction.editReply({

                        embeds: [

                            createErrorEmbed(
                                "Debes estar en el mismo canal de voz que NR MUSIC."
                            )

                        ]

                    });

                }

                guildMusic.textChannel =
                    interaction.channel;

                const query =
                    interaction.options
                        .getString(
                            "cancion"
                        );

                const song =
                    await searchSong(
                        query
                    );

                if (!song) {

                    return interaction.editReply({

                        embeds: [

                            createErrorEmbed(
                                "🔎 No encontré esa canción."
                            )

                        ]

                    });

                }

                const isPlaying =
                    guildMusic.current &&
                    (
                        guildMusic.player.state.status ===
                        AudioPlayerStatus.Playing ||

                        guildMusic.player.state.status ===
                        AudioPlayerStatus.Paused
                    );

                // --------------------------------------------
                // QUEUE
                // --------------------------------------------

                if (
                    isPlaying
                ) {

                    guildMusic.queue.push(
                        song
                    );

                    return interaction.editReply({

                        embeds: [

                            createEmbed(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n\n` +
                                `📍 Posición: **${guildMusic.queue.length}**`
                            )

                        ]

                    });

                }

                // --------------------------------------------
                // PLAY NOW
                // --------------------------------------------

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

                            createErrorEmbed(
                                "❌ No pude reproducir esa canción."
                            )

                        ]

                    });

                }

                const embed =
                    createEmbed(
                        "🎶 Reproduciendo",
                        `**${song.title}**`
                    );

                if (
                    song.thumbnail
                ) {

                    embed.setThumbnail(
                        song.thumbnail
                    );

                }

                return interaction.editReply({

                    embeds: [
                        embed
                    ]

                });

            } catch (error) {

                console.error(
                    error
                );

                return interaction.editReply({

                    embeds: [

                        createErrorEmbed(
                            "Ocurrió un error al reproducir la canción."
                        )

                    ]

                });

            }

        }

        // ====================================================
        // PAUSE
        // ====================================================

        if (
            command === "pause"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.current
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "No hay ninguna canción reproduciéndose."
                        )

                    ],

                    ephemeral: true

                });

            }

            guildMusic.player.pause();

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "⏸️ Pausado",
                        `Se pausó **${guildMusic.current.title}**.`
                    )

                ]

            });

        }

        // ====================================================
        // RESUME
        // ====================================================

        if (
            command === "resume"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.current
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "No hay ninguna canción para reanudar."
                        )

                    ],

                    ephemeral: true

                });

            }

            guildMusic.player.unpause();

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "▶️ Reanudado",
                        `Continuando **${guildMusic.current.title}**.`
                    )

                ]

            });

        }

        // ====================================================
        // SKIP
        // ====================================================

        if (
            command === "skip"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.current
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "No hay ninguna canción reproduciéndose."
                        )

                    ],

                    ephemeral: true

                });

            }

            guildMusic.player.stop();

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "⏭️ Canción saltada",
                        "Reproduciendo la siguiente canción..."
                    )

                ]

            });

        }

        // ====================================================
        // STOP
        // ====================================================

        if (
            command === "stop"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.connection
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "NR MUSIC no está conectado al VC."
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

                    createEmbed(
                        "🛑 Música detenida",
                        "La reproducción se detuvo, la cola fue eliminada y NR MUSIC salió del canal de voz."
                    )

                ]

            });

        }

        // ====================================================
        // QUEUE
        // ====================================================

        if (
            command === "queue"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                (
                    !guildMusic.current &&
                    guildMusic.queue.length === 0
                )
            ) {

                return interaction.reply({

                    embeds: [

                        createEmbed(
                            "📋 Cola vacía",
                            "No hay canciones en la cola."
                        )

                    ]

                });

            }

            let description = "";

            if (
                guildMusic.current
            ) {

                description +=
                    `🎶 **Ahora:** ${guildMusic.current.title}\n\n`;

            }

            if (
                guildMusic.queue.length
            ) {

                description +=
                    "**📋 Próximas:**\n";

                guildMusic.queue
                    .slice(
                        0,
                        15
                    )
                    .forEach(
                        (
                            song,
                            index
                        ) => {

                            description +=
                                `\`${index + 1}.\` ${song.title}\n`;

                        }
                    );

                if (
                    guildMusic.queue.length > 15
                ) {

                    description +=
                        `\n... y **${guildMusic.queue.length - 15}** más.`;

                }

            }

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "📋 Cola de NR MUSIC",
                        description
                    )

                ]

            });

        }

        // ====================================================
        // NOW PLAYING
        // ====================================================

        if (
            command === "nowplaying"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.current
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "No hay ninguna canción reproduciéndose."
                        )

                    ],

                    ephemeral: true

                });

            }

            const status =
                guildMusic.player.state.status;

            const embed =
                createEmbed(
                    "🎶 Sonando ahora",
                    `**${guildMusic.current.title}**\n\n` +
                    `🔊 Volumen: **${guildMusic.volume}%**\n` +
                    `🔁 Loop: **${guildMusic.loop ? "Activado" : "Desactivado"}**\n` +
                    `▶️ Estado: **${
                        status === AudioPlayerStatus.Paused
                            ? "Pausado"
                            : "Reproduciendo"
                    }**`
                );

            if (
                guildMusic.current.thumbnail
            ) {

                embed.setThumbnail(
                    guildMusic.current.thumbnail
                );

            }

            return interaction.reply({

                embeds: [
                    embed
                ]

            });

        }

        // ====================================================
        // VOLUME
        // ====================================================

        if (
            command === "volume"
        ) {

            const level =
                interaction.options
                    .getInteger(
                        "nivel"
                    );

            const guildMusic =
                getGuildMusic(
                    guildId
                );

            guildMusic.volume =
                level;

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "🔊 Volumen actualizado",
                        `El volumen ahora está en **${level}%**.`
                    )

                ]

            });

        }

        // ====================================================
        // LOOP
        // ====================================================

        if (
            command === "loop"
        ) {

            const guildMusic =
                getGuildMusic(
                    guildId
                );

            guildMusic.loop =
                !guildMusic.loop;

            return interaction.reply({

                embeds: [

                    createEmbed(
                        guildMusic.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",

                        guildMusic.loop
                            ? "La canción actual se repetirá automáticamente."
                            : "La repetición fue desactivada."
                    )

                ]

            });

        }

        // ====================================================
        // SHUFFLE
        // ====================================================

        if (
            command === "shuffle"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                guildMusic.queue.length < 2
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "Necesitas al menos 2 canciones en la cola."
                        )

                    ],

                    ephemeral: true

                });

            }

            for (
                let i =
                    guildMusic.queue.length - 1;

                i > 0;

                i--
            ) {

                const j =
                    Math.floor(
                        Math.random() *
                        (i + 1)
                    );

                [
                    guildMusic.queue[i],
                    guildMusic.queue[j]
                ] = [
                    guildMusic.queue[j],
                    guildMusic.queue[i]
                ];

            }

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "🔀 Cola mezclada",
                        "El orden de la cola fue mezclado correctamente."
                    )

                ]

            });

        }

        // ====================================================
        // REMOVE
        // ====================================================

        if (
            command === "remove"
        ) {

            const position =
                interaction.options
                    .getInteger(
                        "posicion"
                    );

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                guildMusic.queue.length === 0
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "La cola está vacía."
                        )

                    ],

                    ephemeral: true

                });

            }

            if (
                position < 1 ||
                position >
                guildMusic.queue.length
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            `La posición debe estar entre **1** y **${guildMusic.queue.length}**.`
                        )

                    ],

                    ephemeral: true

                });

            }

            const removed =
                guildMusic.queue.splice(
                    position - 1,
                    1
                )[0];

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "🗑️ Canción eliminada",
                        `Se eliminó **${removed.title}** de la cola.`
                    )

                ]

            });

        }

        // ====================================================
        // CLEAR
        // ====================================================

        if (
            command === "clear"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                guildMusic.queue.length === 0
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "La cola ya está vacía."
                        )

                    ],

                    ephemeral: true

                });

            }

            const amount =
                guildMusic.queue.length;

            guildMusic.queue =
                [];

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "🧹 Cola limpiada",
                        `Se eliminaron **${amount} canciones** de la cola.`
                    )

                ]

            });

        }

        // ====================================================
        // DISCONNECT
        // ====================================================

        if (
            command === "disconnect"
        ) {

            const guildMusic =
                music.get(
                    guildId
                );

            if (
                !guildMusic ||
                !guildMusic.connection
            ) {

                return interaction.reply({

                    embeds: [

                        createErrorEmbed(
                            "NR MUSIC no está conectado al canal de voz."
                        )

                    ],

                    ephemeral: true

                });

            }

            try {

                guildMusic.player.stop(
                    true
                );

            } catch {}

            try {

                guildMusic.connection.destroy();

            } catch {}

            guildMusic.connection =
                null;

            guildMusic.current =
                null;

            return interaction.reply({

                embeds: [

                    createEmbed(
                        "🚪 Desconectado",
                        "NR MUSIC abandonó el canal de voz."
                    )

                ]

            });

        }

        // ====================================================
        // HELP
        // ====================================================

        if (
            command === "help"
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0x5865F2
                    )

                    .setTitle(
                        "🎵 NR MUSIC"
                    )

                    .setDescription(
                        "Bot global de música para Discord.\n\n" +
                        "Todos los comandos disponibles:"
                    )

                    .addFields(

                        {
                            name:
                                "🎧 Conexión",

                            value:
                                "`/join` — Entrar al VC.\n" +
                                "`/disconnect` — Salir del VC.\n" +
                                "`/stop` — Detener todo."
                        },

                        {
                            name:
                                "🎵 Reproducción",

                            value:
                                "`/play <canción>` — Reproducir.\n" +
                                "`/pause` — Pausar.\n" +
                                "`/resume` — Reanudar.\n" +
                                "`/skip` — Siguiente."
                        },

                        {
                            name:
                                "📋 Cola",

                            value:
                                "`/queue` — Ver cola.\n" +
                                "`/nowplaying` — Ver canción actual.\n" +
                                "`/remove <posición>` — Eliminar.\n" +
                                "`/clear` — Vaciar cola.\n" +
                                "`/shuffle` — Mezclar."
                        },

                        {
                            name:
                                "⚙️ Control",

                            value:
                                "`/volume <1-100>` — Volumen.\n" +
                                "`/loop` — Repetición."
                        },

                        {
                            name:
                                "🔴 NR MUSIC",

                            value:
                                "Estado: **DND**\n" +
                                "🎵 +10 bots en funcionamiento | /help"
                        }

                    )

                    .setFooter({
                        text:
                            "NR MUSIC • Global"
                    })

                    .setTimestamp();

            return interaction.reply({

                embeds: [
                    embed
                ]

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
            "=========================================="
        );

        console.log(
            "🎵 NR MUSIC — GLOBAL"
        );

        console.log(
            "=========================================="
        );

        console.log(
            `🤖 Bot: ${client.user.tag}`
        );

        console.log(
            `🆔 ID: ${client.user.id}`
        );

        console.log(
            `🌎 Servidores: ${client.guilds.cache.size}`
        );

        console.log(
            `🌐 PORT: ${PORT}`
        );

        console.log(
            "🔴 Estado: DND"
        );

        console.log(
            "🎵 +10 bots en funcionamiento | /help"
        );

        console.log(
            "=========================================="
        );

        // ----------------------------------------------------
        // PRESENCIA
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // GLOBAL COMMANDS
        // ----------------------------------------------------

        await registerCommands();

    }
);

// ============================================================
// PROCESS ERRORS
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
