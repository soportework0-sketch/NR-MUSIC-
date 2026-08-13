// ============================================================
// 🎵 NR MUSIC — GLOBAL MUSIC BOT
// YouTube + yt-dlp + FFmpeg + Discord Voice
// ============================================================

const express = require("express");
const { spawn } = require("child_process");

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
    StreamType,
    entersState
} = require("@discordjs/voice");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

const AUTO_DISCONNECT = 5 * 60 * 1000;

if (!TOKEN) {
    console.error("❌ Falta la variable TOKEN");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ Falta la variable CLIENT_ID");
    process.exit(1);
}

// ============================================================
// EXPRESS
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
    align-items: center;
    justify-content: center;
    background: #08080c;
    color: white;
    font-family: Arial, sans-serif;
}

.card {
    width: 90%;
    max-width: 620px;
    padding: 50px 30px;
    text-align: center;
    background: #121219;
    border: 1px solid #292936;
    border-radius: 25px;
    box-shadow: 0 20px 70px rgba(0,0,0,.5);
}

.logo {
    font-size: 70px;
}

h1 {
    margin: 10px 0;
    font-size: 44px;
}

.status {
    display: inline-block;
    padding: 9px 18px;
    border-radius: 50px;
    background: #12351f;
    color: #57f287;
    font-weight: bold;
}

p {
    color: #aaa;
}

.footer {
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

    <div class="status">
        ● ONLINE
    </div>

    <p>Global Discord Music Bot</p>

    <p>🎵 +10 bots en funcionamiento | /help</p>

    <div class="footer">
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
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server activo en PORT ${PORT}`);
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
// MUSIC DATA
// ============================================================

const music = new Map();

function createGuildMusic(guildId) {

    if (music.has(guildId)) {
        return music.get(guildId);
    }

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause
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
        emptyTimer: null,
        ytProcess: null
    };

    player.on(
        AudioPlayerStatus.Idle,
        async () => {

            const current =
                music.get(guildId);

            if (!current) return;

            await playNext(guildId);
        }
    );

    player.on("error", async error => {

        console.error(
            "❌ Error del reproductor:",
            error
        );

        const current =
            music.get(guildId);

        if (!current) return;

        killYTDLP(current);

        current.current = null;

        await playNext(guildId);
    });

    music.set(
        guildId,
        data
    );

    return data;
}

function getMusic(guildId) {
    return createGuildMusic(guildId);
}

// ============================================================
// EMBEDS
// ============================================================

function successEmbed(title, description) {

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
// YT-DLP
// ============================================================

function runYTDLP(args) {

    return new Promise((resolve, reject) => {

        const process =
            spawn("yt-dlp", args, {
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            });

        let stdout = "";
        let stderr = "";

        process.stdout.on(
            "data",
            data => {
                stdout += data.toString();
            }
        );

        process.stderr.on(
            "data",
            data => {
                stderr += data.toString();
            }
        );

        process.on(
            "error",
            reject
        );

        process.on(
            "close",
            code => {

                if (code !== 0) {

                    return reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );
                }

                resolve(
                    stdout.trim()
                );
            }
        );
    });
}

// ============================================================
// SEARCH YOUTUBE
// ============================================================

async function searchYouTube(query) {

    try {

        const result =
            await runYTDLP([
                "--flat-playlist",
                "--dump-single-json",
                "--no-warnings",
                `ytsearch1:${query}`
            ]);

        const data =
            JSON.parse(result);

        let entry =
            data.entries?.[0];

        if (!entry) {
            return null;
        }

        let url =
            entry.webpage_url ||
            entry.original_url;

        if (!url && entry.id) {

            url =
                `https://www.youtube.com/watch?v=${entry.id}`;
        }

        return {
            title:
                entry.title ||
                "Canción desconocida",

            url,

            id:
                entry.id,

            duration:
                entry.duration || null,

            thumbnail:
                entry.thumbnail || null
        };

    } catch (error) {

        console.error(
            "❌ Error buscando YouTube:",
            error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER AUDIO
// ============================================================

function getAudioStream(url) {

    return new Promise((resolve, reject) => {

        const args = [

            "--no-playlist",

            "--no-warnings",

            "--quiet",

            "--no-progress",

            "-f",
            "bestaudio/best",

            "-o",
            "-",

            url
        ];

        const process =
            spawn(
                "yt-dlp",
                args,
                {
                    stdio: [
                        "ignore",
                        "pipe",
                        "pipe"
                    ]
                }
            );

        let stderr = "";

        process.stderr.on(
            "data",
            data => {

                stderr +=
                    data.toString();
            }
        );

        process.on(
            "error",
            error => {

                reject(error);
            }
        );

        process.on(
            "close",
            code => {

                if (
                    code !== 0 &&
                    !process.killed
                ) {

                    console.error(
                        "yt-dlp:",
                        stderr
                    );
                }
            }
        );

        resolve(process);
    });
}

// ============================================================
// FFmpeg
// ============================================================

function createFFmpeg(input) {

    const ffmpeg =
        spawn(
            "ffmpeg",
            [
                "-hide_banner",
                "-loglevel",
                "error",

                "-i",
                "pipe:0",

                "-f",
                "s16le",

                "-ar",
                "48000",

                "-ac",
                "2",

                "pipe:1"
            ],
            {
                stdio: [
                    "pipe",
                    "pipe",
                    "pipe"
                ]
            }
        );

    input.stdout.pipe(
        ffmpeg.stdin
    );

    input.stdout.on(
        "error",
        () => {}
    );

    ffmpeg.stdin.on(
        "error",
        () => {}
    );

    return ffmpeg;
}

// ============================================================
// MATAR YTDLP
// ============================================================

function killYTDLP(data) {

    if (
        data &&
        data.ytProcess
    ) {

        try {
            data.ytProcess.kill(
                "SIGKILL"
            );
        } catch {}

        data.ytProcess = null;
    }
}

// ============================================================
// PLAY SONG
// ============================================================

async function playSong(
    song,
    guildId
) {

    const data =
        getMusic(guildId);

    killYTDLP(data);

    try {

        const yt =
            await getAudioStream(
                song.url
            );

        data.ytProcess =
            yt;

        const ffmpeg =
            createFFmpeg(
                yt
            );

        const resource =
            createAudioResource(
                ffmpeg.stdout,
                {
                    inputType:
                        StreamType.Raw,

                    inlineVolume:
                        true
                }
            );

        if (resource.volume) {

            resource.volume.setVolume(
                data.volume / 100
            );
        }

        data.player.play(
            resource
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Error obteniendo audio:",
            error.message
        );

        killYTDLP(data);

        return false;
    }
}

// ============================================================
// PLAY NEXT
// ============================================================

async function playNext(guildId) {

    const data =
        music.get(guildId);

    if (!data) return;

    // LOOP
    if (
        data.loop &&
        data.current
    ) {

        const success =
            await playSong(
                data.current,
                guildId
            );

        if (!success) {

            data.current = null;
            data.loop = false;

            await playNext(
                guildId
            );
        }

        return;
    }

    // COLA VACÍA
    if (
        data.queue.length === 0
    ) {

        data.current = null;

        return;
    }

    const song =
        data.queue.shift();

    data.current =
        song;

    const success =
        await playSong(
            song,
            guildId
        );

    if (!success) {

        data.current = null;

        if (data.textChannel) {

            data.textChannel.send({

                embeds: [
                    errorEmbed(
                        `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                    )
                ]

            }).catch(() => {});
        }

        await playNext(
            guildId
        );

        return;
    }

    if (data.textChannel) {

        const message =
            successEmbed(
                "🎶 Reproduciendo ahora",
                `**${song.title}**\n\n` +
                `📺 YouTube`
            );

        if (song.thumbnail) {

            message.setThumbnail(
                song.thumbnail
            );
        }

        data.textChannel.send({
            embeds: [message]
        }).catch(() => {});
    }
}

// ============================================================
// CONNECT
// ============================================================

async function connectVoice(
    channel,
    guildId
) {

    const data =
        getMusic(guildId);

    if (data.emptyTimer) {

        clearTimeout(
            data.emptyTimer
        );

        data.emptyTimer = null;
    }

    const connection =
        joinVoiceChannel({

            channelId:
                channel.id,

            guildId:
                channel.guild.id,

            adapterCreator:
                channel.guild.voiceAdapterCreator,

            selfDeaf:
                true,

            selfMute:
                false
        });

    data.connection =
        connection;

    connection.subscribe(
        data.player
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

        data.connection = null;

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
// DISCONNECT
// ============================================================

function disconnectGuild(
    guildId,
    clearQueue = true
) {

    const data =
        music.get(guildId);

    if (!data) return;

    if (data.emptyTimer) {

        clearTimeout(
            data.emptyTimer
        );

        data.emptyTimer = null;
    }

    killYTDLP(data);

    try {
        data.player.stop(true);
    } catch {}

    if (data.connection) {

        try {
            data.connection.destroy();
        } catch {}
    }

    data.connection = null;
    data.current = null;

    if (clearQueue) {
        data.queue = [];
    }
}

// ============================================================
// AUTO DISCONNECT
// ============================================================

function checkEmpty(guild) {

    const data =
        music.get(guild.id);

    if (!data.connection) {
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

    if (humans.size > 0) {

        if (data.emptyTimer) {

            clearTimeout(
                data.emptyTimer
            );

            data.emptyTimer = null;
        }

        return;
    }

    if (data.emptyTimer) {
        return;
    }

    data.emptyTimer =
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

                const channel =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!channel) {

                    disconnectGuild(
                        guild.id,
                        true
                    );

                    return;
                }

                const users =
                    channel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

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
// VOICE EVENTS
// ============================================================

client.on(
    "voiceStateUpdate",
    (oldState, newState) => {

        checkEmpty(
            newState.guild ||
            oldState.guild
        );
    }
);

// ============================================================
// COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "🎧 Entra al canal de voz."
        ),

    new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "🎵 Busca y reproduce una canción."
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
            "⏸️ Pausa la música."
        ),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "▶️ Reanuda la música."
        ),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription(
            "⏭️ Salta la canción."
        ),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "🛑 Detiene todo y sale."
        ),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription(
            "📋 Muestra la cola."
        ),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription(
            "🎶 Muestra la canción actual."
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
                        "Volumen 1-100."
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
            "📚 Muestra la ayuda."
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

        if (!interaction.guild) {

            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Este comando solo funciona en un servidor."
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
                interaction.member.voice.channel;

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

                const data =
                    getMusic(guildId);

                if (
                    data.connection &&
                    guild.members.me
                        ?.voice
                        ?.channelId === voice.id
                ) {

                    return interaction.reply({
                        embeds: [
                            successEmbed(
                                "🎧 Ya estoy conectado",
                                `Estoy en **${voice.name}**.`
                            )
                        ]
                    });
                }

                await connectVoice(
                    voice,
                    guildId
                );

                data.textChannel =
                    interaction.channel;

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "🎧 Conectado",
                            `Entré a **${voice.name}**.`
                        )
                    ]
                });

            } catch {

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
                interaction.member.voice.channel;

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

            const data =
                getMusic(guildId);

            data.textChannel =
                interaction.channel;

            try {

                if (!data.connection) {

                    await connectVoice(
                        voice,
                        guildId
                    );

                } else if (
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

                const query =
                    interaction.options.getString(
                        "cancion"
                    );

                // BUSCAR
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

                const playing =
                    data.current &&
                    (
                        data.player.state.status ===
                        AudioPlayerStatus.Playing ||

                        data.player.state.status ===
                        AudioPlayerStatus.Paused
                    );

                // SI YA ESTÁ SONANDO
                if (playing) {

                    data.queue.push(
                        song
                    );

                    return interaction.editReply({
                        embeds: [
                            successEmbed(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n\n` +
                                `📍 Posición: **#${data.queue.length}**`
                            )
                        ]
                    });
                }

                // REPRODUCIR
                data.current =
                    song;

                const success =
                    await playSong(
                        song,
                        guildId
                    );

                if (!success) {

                    data.current = null;

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                `🔎 **Canción encontrada**\n\n` +
                                `🎵 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                            )
                        ]
                    });
                }

                const message =
                    successEmbed(
                        "🎶 Reproduciendo ahora",
                        `**${song.title}**\n\n` +
                        "📺 YouTube"
                    );

                if (song.thumbnail) {

                    message.setThumbnail(
                        song.thumbnail
                    );
                }

                return interaction.editReply({
                    embeds: [message]
                });

            } catch (error) {

                console.error(
                    "❌ /play:",
                    error
                );

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "🔎 Encontré la canción, pero no puedo obtener su audio en este momento."
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
                            "No hay ninguna canción reproduciéndose."
                        )
                    ]
                });
            }

            data.player.pause();

            return interaction.reply({
                embeds: [
                    successEmbed(
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
                    ]
                });
            }

            data.player.unpause();

            return interaction.reply({
                embeds: [
                    successEmbed(
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
                            "No hay ninguna canción reproduciéndose."
                        )
                    ]
                });
            }

            data.player.stop();

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "⏭️ Canción saltada",
                        "Continuando con la siguiente canción..."
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
                    ]
                });
            }

            disconnectGuild(
                guildId,
                true
            );

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🛑 Detenido",
                        "Música detenida, cola limpiada y NR MUSIC desconectado."
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
                !data?.current &&
                (!data || data.queue.length === 0)
            ) {

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "📋 Cola vacía",
                            "No hay canciones."
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
                    "📋 **Siguiente:**\n\n";

                data.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            text +=
                                `\`${index + 1}\` ${song.title}\n`;
                        }
                    );

                if (data.queue.length > 20) {

                    text +=
                        `\n... y ${data.queue.length - 20} más.`;
                }
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
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
                            "No hay ninguna canción reproduciéndose."
                        )
                    ]
                });
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🎶 Ahora reproduciendo",
                        `**${data.current.title}**\n\n` +
                        `🔊 Volumen: **${data.volume}%**\n` +
                        `🔁 Loop: **${data.loop ? "Activado" : "Desactivado"}**`
                    )
                ]
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
                    successEmbed(
                        "🔊 Volumen cambiado",
                        `Volumen: **${level}%**`
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
                    successEmbed(
                        data.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",

                        data.loop
                            ? "La canción actual se repetirá."
                            : "La canción continuará con la cola."
                    )
                ]
            });
        }

        // ====================================================
        // SHUFFLE
        // ====================================================

        if (command === "shuffle") {

            const data =
                getMusic(guildId);

            if (data.queue.length < 2) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Necesitas al menos 2 canciones en la cola."
                        )
                    ]
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
                    successEmbed(
                        "🔀 Cola mezclada",
                        "La cola fue mezclada correctamente."
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
                getMusic(guildId);

            if (
                position < 1 ||
                position > data.queue.length
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Esa posición no existe en la cola."
                        )
                    ]
                });
            }

            const removed =
                data.queue.splice(
                    position - 1,
                    1
                )[0];

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🗑️ Canción eliminada",
                        `Eliminé **${removed.title}** de la cola.`
                    )
                ]
            });
        }

        // ====================================================
        // CLEAR
        // ====================================================

        if (command === "clear") {

            const data =
                getMusic(guildId);

            const amount =
                data.queue.length;

            data.queue = [];

            return interaction.reply({
                embeds: [
                    successEmbed(
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
                    ]
                });
            }

            disconnectGuild(
                guildId,
                false
            );

            return interaction.reply({
                embeds: [
                    successEmbed(
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
                        "Bot global de música para Discord.\n\n" +
                        "Busca canciones directamente con `/play`."
                    )

                    .addFields(

                        {
                            name: "🎧 VOZ",
                            value:
                                "`/join`\n" +
                                "`/disconnect`\n" +
                                "`/stop`"
                        },

                        {
                            name: "🎵 MÚSICA",
                            value:
                                "`/play <canción>`\n" +
                                "`/pause`\n" +
                                "`/resume`\n" +
                                "`/skip`"
                        },

                        {
                            name: "📋 COLA",
                            value:
                                "`/queue`\n" +
                                "`/nowplaying`\n" +
                                "`/remove <posición>`\n" +
                                "`/clear`\n" +
                                "`/shuffle`"
                        },

                        {
                            name: "⚙️ CONTROL",
                            value:
                                "`/volume <1-100>`\n" +
                                "`/loop`"
                        },

                        {
                            name: "🔴 ESTADO",
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
            "🔴 Estado DND"
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
// ERRORS
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

client.login(TOKEN);
