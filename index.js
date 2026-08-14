// ============================================================
// 🎵 NR MUSIC
// Global Discord Music Bot
// Node.js + Discord.js + @discordjs/voice + yt-dlp + FFmpeg
// ============================================================

const express = require("express");
const { spawn } = require("child_process");

const {
    Client,
    GatewayIntentBits,
    ActivityType,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType
} = require("@discordjs/voice");

const ffmpegPath = require("ffmpeg-static");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 10000;

if (!TOKEN) {
    console.error("❌ Falta la variable TOKEN.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ Falta la variable CLIENT_ID.");
    process.exit(1);
}

console.log("🎵 Iniciando NR MUSIC...");

// ============================================================
// WEB SERVER — RENDER
// ============================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
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
    background:
        radial-gradient(circle at top, #202044 0%, #090910 45%, #050507 100%);
    color: white;
    font-family: Arial, sans-serif;
}

.card {
    width: min(90%, 600px);
    padding: 45px;
    text-align: center;
    background: rgba(20,20,30,.92);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 28px;
    box-shadow: 0 25px 80px rgba(0,0,0,.45);
}

.logo {
    font-size: 70px;
}

h1 {
    margin: 10px 0;
    font-size: 42px;
}

.status {
    color: #57f287;
    font-weight: bold;
    margin: 15px 0;
}

p {
    color: #b9b9c8;
}

.badge {
    display: inline-block;
    margin-top: 15px;
    padding: 10px 18px;
    border-radius: 999px;
    background: rgba(88,101,242,.18);
    color: #aeb7ff;
}
</style>
</head>
<body>
<div class="card">
    <div class="logo">🎵</div>
    <h1>NR MUSIC</h1>
    <div class="status">● ONLINE</div>
    <p>Global Discord Music Bot</p>
    <div class="badge">🎵 +10 bots en funcionamiento | /help</div>
</div>
</body>
</html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        bot: "NR MUSIC",
        guilds: client?.guilds?.cache?.size || 0,
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server activo en PORT ${PORT}`);
});

// ============================================================
// CLIENTE DISCORD
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================================================
// ESTADO POR SERVIDOR
// ============================================================

const guildMusic = new Map();

function getMusic(guildId) {

    if (!guildMusic.has(guildId)) {

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
            volume: 1,
            loop: false,
            textChannel: null,
            ytProcess: null,
            ffmpegProcess: null,
            emptyTimer: null,
            playing: false
        };

        player.on(
            AudioPlayerStatus.Idle,
            async () => {

                const music =
                    guildMusic.get(guildId);

                if (!music) return;

                music.playing = false;

                if (music.ytProcess) {
                    try {
                        music.ytProcess.kill("SIGKILL");
                    } catch {}
                }

                music.ytProcess = null;
                music.ffmpegProcess = null;

                if (
                    music.current &&
                    music.loop
                ) {

                    await startSong(
                        guildId,
                        music.current,
                        false
                    );

                    return;
                }

                music.current = null;

                await playNext(guildId);
            }
        );

        player.on(
            "error",
            error => {

                console.error(
                    "❌ Error del AudioPlayer:",
                    error
                );

                const music =
                    guildMusic.get(guildId);

                if (!music) return;

                stopProcesses(music);

                music.current = null;
                music.playing = false;

                playNext(guildId);
            }
        );

        guildMusic.set(
            guildId,
            data
        );
    }

    return guildMusic.get(guildId);
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
// EJECUTAR YT-DLP
// ============================================================

function runYTDLP(args) {

    return new Promise((resolve, reject) => {

        const processYTDLP =
            spawn("yt-dlp", args, {
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            });

        let stdout = "";
        let stderr = "";

        processYTDLP.stdout.on(
            "data",
            data => {
                stdout += data.toString();
            }
        );

        processYTDLP.stderr.on(
            "data",
            data => {
                stderr += data.toString();
            }
        );

        processYTDLP.on(
            "error",
            error => {
                reject(error);
            }
        );

        processYTDLP.on(
            "close",
            code => {

                if (code !== 0) {

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );

                    return;
                }

                resolve(stdout.trim());
            }
        );
    });
}

// ============================================================
// BUSCAR CANCIÓN
// ============================================================

async function searchSong(query) {

    console.log(`🔎 Buscando: ${query}`);

    try {

        const output =
            await runYTDLP([
                `ytsearch1:${query}`,
                "--flat-playlist",
                "--dump-single-json",
                "--skip-download",
                "--no-warnings"
            ]);

        if (!output) {

            console.log(
                "❌ yt-dlp no devolvió resultados."
            );

            return null;
        }

        let data;

        try {

            data = JSON.parse(output);

        } catch (error) {

            console.error(
                "❌ Respuesta JSON inválida de yt-dlp."
            );

            console.error(output);

            return null;
        }

        const video =
            data.entries?.[0] || data;

        if (!video || !video.id) {

            console.log(
                "❌ No se encontró ningún resultado."
            );

            return null;
        }

        const song = {
            id: video.id,
            title: video.title || "Canción desconocida",
            url:
                video.webpage_url ||
                `https://www.youtube.com/watch?v=${video.id}`,
            thumbnail: video.thumbnail || null,
            duration: video.duration || 0
        };

        console.log(
            `✅ Encontré: ${song.title}`
        );

        return song;

    } catch (error) {

        console.error(
            "❌ Error buscando canción:"
        );

        console.error(
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
            "--no-progress",

            "-f",
            "bestaudio/best",

            "--extractor-args",
            "youtube:player_client=android,web",

            "-o",
            "-",

            url
        ];

        console.log(
            "🎧 Obteniendo audio..."
        );

        const processYTDLP =
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
        let gotAudio = false;

        processYTDLP.stdout.once(
            "data",
            () => {

                gotAudio = true;

                console.log(
                    "✅ Audio recibido desde yt-dlp."
                );

                resolve(processYTDLP);
            }
        );

        processYTDLP.stderr.on(
            "data",
            data => {

                const text =
                    data.toString();

                stderr += text;

                if (
                    text.trim()
                ) {
                    console.log(
                        "🎧 yt-dlp:",
                        text.trim()
                    );
                }
            }
        );

        processYTDLP.on(
            "error",
            error => {

                if (!gotAudio) {
                    reject(error);
                }
            }
        );

        processYTDLP.on(
            "close",
            code => {

                if (
                    !gotAudio &&
                    code !== 0
                ) {

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );
                }
            }
        );
    });
}

// ============================================================
// FFmpeg
// ============================================================

function startFFmpeg(ytdlpProcess) {

    console.log(
        "🎚️ Iniciando FFmpeg..."
    );

    console.log(
        `🎚️ FFmpeg: ${ffmpegPath}`
    );

    const ffmpeg =
        spawn(
            ffmpegPath,
            [
                "-hide_banner",

                "-loglevel",
                "error",

                "-i",
                "pipe:0",

                "-vn",

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

    ytdlpProcess.stdout.pipe(
        ffmpeg.stdin
    );

    ffmpeg.stderr.on(
        "data",
        data => {

            const text =
                data.toString().trim();

            if (text) {

                console.error(
                    "🎚️ FFmpeg:",
                    text
                );
            }
        }
    );

    ffmpeg.on(
        "error",
        error => {

            console.error(
                "❌ Error iniciando FFmpeg:",
                error
            );
        }
    );

    return ffmpeg;
}

// ============================================================
// DETENER PROCESOS
// ============================================================

function stopProcesses(music) {

    if (!music) return;

    if (music.ytProcess) {

        try {
            music.ytProcess.kill(
                "SIGKILL"
            );
        } catch {}

        music.ytProcess = null;
    }

    if (music.ffmpegProcess) {

        try {
            music.ffmpegProcess.kill(
                "SIGKILL"
            );
        } catch {}

        music.ffmpegProcess = null;
    }
}

// ============================================================
// REPRODUCIR CANCIÓN
// ============================================================

async function startSong(
    guildId,
    song,
    sendMessage = true
) {

    const music =
        getMusic(guildId);

    stopProcesses(music);

    try {

        const ytdlp =
            await getAudioStream(
                song.url
            );

        music.ytProcess =
            ytdlp;

        const ffmpeg =
            startFFmpeg(
                ytdlp
            );

        music.ffmpegProcess =
            ffmpeg;

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
                music.volume
            );
        }

        music.player.play(
            resource
        );

        music.playing = true;

        console.log(
            `▶️ Reproduciendo: ${song.title}`
        );

        if (
            sendMessage &&
            music.textChannel
        ) {

            music.textChannel.send({

                embeds: [
                    successEmbed(
                        "🎶 Reproduciendo",
                        `**${song.title}**`
                    )
                ]

            }).catch(() => {});
        }

        return true;

    } catch (error) {

        console.error(
            "❌ No se pudo obtener/reproducir el audio:"
        );

        console.error(
            error.message
        );

        stopProcesses(music);

        music.playing = false;

        return false;
    }
}

// ============================================================
// SIGUIENTE CANCIÓN
// ============================================================

async function playNext(guildId) {

    const music =
        guildMusic.get(guildId);

    if (!music) return;

    if (!music.connection) {
        return;
    }

    if (!music.queue.length) {

        music.current = null;
        music.playing = false;

        return;
    }

    const song =
        music.queue.shift();

    music.current =
        song;

    const success =
        await startSong(
            guildId,
            song,
            true
        );

    if (!success) {

        if (music.textChannel) {

            music.textChannel.send({

                embeds: [
                    errorEmbed(
                        `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                    )
                ]

            }).catch(() => {});
        }

        music.current = null;

        await playNext(
            guildId
        );
    }
}

// ============================================================
// CONECTAR A VOZ
// ============================================================

async function connectVoice(
    channel,
    guildId
) {

    const music =
        getMusic(guildId);

    if (
        music.connection
    ) {

        return music.connection;
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

    music.connection =
        connection;

    connection.subscribe(
        music.player
    );

    console.log(
        `🎧 Conectado a ${channel.name}`
    );

    return connection;
}

// ============================================================
// DESCONECTAR
// ============================================================

function disconnectVoice(
    guildId,
    clearQueue = true
) {

    const music =
        guildMusic.get(guildId);

    if (!music) return;

    stopProcesses(music);

    try {
        music.player.stop(true);
    } catch {}

    if (music.connection) {

        try {
            music.connection.destroy();
        } catch {}

        music.connection = null;
    }

    music.current = null;
    music.playing = false;

    if (clearQueue) {
        music.queue = [];
    }
}

// ============================================================
// AUTO-DESCONECTAR
// ============================================================

function checkEmpty(guild) {

    const music =
        guildMusic.get(guild.id);

    if (!music) return;

    const botMember =
        guild.members.me;

    if (!botMember) return;

    const voiceChannel =
        botMember.voice.channel;

    if (!voiceChannel) return;

    const humans =
        voiceChannel.members.filter(
            member =>
                !member.user.bot
        );

    if (humans.size > 0) {

        if (music.emptyTimer) {

            clearTimeout(
                music.emptyTimer
            );

            music.emptyTimer = null;
        }

        return;
    }

    if (music.emptyTimer) {
        return;
    }

    console.log(
        `👥 NR MUSIC está solo en ${guild.name}.`
    );

    music.emptyTimer =
        setTimeout(
            () => {

                const currentChannel =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!currentChannel) {
                    return;
                }

                const users =
                    currentChannel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

                    console.log(
                        `🚪 Desconectando de ${guild.name}.`
                    );

                    disconnectVoice(
                        guild.id,
                        true
                    );
                }

                music.emptyTimer = null;

            },
            5 * 60 * 1000
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

        if (guild) {
            checkEmpty(guild);
        }
    }
);

// ============================================================
// COMANDOS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Muestra todos los comandos."
        ),

    new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "🎧 Entra al canal de voz."
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
            "🛑 Detiene todo y desconecta."
        ),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription(
            "🚪 Desconecta el bot."
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
                        "Volumen del 1 al 100."
                    )
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "🔁 Activa/desactiva repetición."
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
                        "Posición de la canción."
                    )
                    .setMinValue(1)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription(
            "🧹 Limpia la cola."
        )

].map(
    command =>
        command.toJSON()
);

// ============================================================
// REGISTRAR COMANDOS GLOBALES
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

        const music =
            getMusic(guildId);

        const command =
            interaction.commandName;

        // ====================================================
        // HELP
        // ====================================================

        if (command === "help") {

            const embed =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(
                        "🎵 NR MUSIC"
                    )
                    .setDescription(
                        "Sistema global de música para Discord."
                    )
                    .addFields(

                        {
                            name: "🎧 VOZ",
                            value:
                                "`/join`\n" +
                                "`/disconnect`\n" +
                                "`/stop`",
                            inline: true
                        },

                        {
                            name: "🎵 REPRODUCCIÓN",
                            value:
                                "`/play <canción>`\n" +
                                "`/pause`\n" +
                                "`/resume`\n" +
                                "`/skip`",
                            inline: true
                        },

                        {
                            name: "📋 COLA",
                            value:
                                "`/queue`\n" +
                                "`/nowplaying`\n" +
                                "`/remove <posición>`\n" +
                                "`/clear`\n" +
                                "`/shuffle`",
                            inline: false
                        },

                        {
                            name: "⚙️ CONTROL",
                            value:
                                "`/volume <1-100>`\n" +
                                "`/loop`",
                            inline: true
                        }

                    )
                    .setFooter({
                        text:
                            "🎵 +10 bots en funcionamiento | /help"
                    });

            return interaction.reply({
                embeds: [embed]
            });
        }

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
                    ]
                });
            }

            try {

                await connectVoice(
                    voice,
                    guildId
                );

                music.textChannel =
                    interaction.channel;

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "🎧 Conectado",
                            `NR MUSIC entró a **${voice.name}**.`
                        )
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ Error /join:",
                    error
                );

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No pude conectarme al canal de voz."
                        )
                    ]
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
                    ]
                });
            }

            await interaction.deferReply();

            music.textChannel =
                interaction.channel;

            const query =
                interaction.options.getString(
                    "cancion"
                );

            try {

                if (!music.connection) {

                    await connectVoice(
                        voice,
                        guildId
                    );
                }

                const song =
                    await searchSong(
                        query
                    );

                if (!song) {

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "❌ No encontré esa canción."
                            )
                        ]
                    });
                }

                // Si ya está sonando algo,
                // agregar a la cola.

                if (music.current) {

                    music.queue.push(
                        song
                    );

                    return interaction.editReply({
                        embeds: [
                            successEmbed(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n\n` +
                                `📍 Posición: **${music.queue.length}**`
                            )
                        ]
                    });
                }

                music.current =
                    song;

                const success =
                    await startSong(
                        guildId,
                        song,
                        false
                    );

                if (!success) {

                    music.current = null;

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                            )
                        ]
                    });
                }

                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "🎶 Reproduciendo",
                            `**${song.title}**`
                        )
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ Error /play:",
                    error
                );

                music.current = null;

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "❌ Ocurrió un error al intentar reproducir el audio."
                        )
                    ]
                });
            }
        }

        // ====================================================
        // PAUSE
        // ====================================================

        if (command === "pause") {

            if (!music.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción reproduciéndose."
                        )
                    ]
                });
            }

            music.player.pause();

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "⏸️ Pausado",
                        `**${music.current.title}**`
                    )
                ]
            });
        }

        // ====================================================
        // RESUME
        // ====================================================

        if (command === "resume") {

            if (!music.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción."
                        )
                    ]
                });
            }

            music.player.unpause();

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "▶️ Reanudado",
                        `**${music.current.title}**`
                    )
                ]
            });
        }

        // ====================================================
        // SKIP
        // ====================================================

        if (command === "skip") {

            if (!music.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción."
                        )
                    ]
                });
            }

            music.player.stop();

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "⏭️ Canción saltada",
                        "Buscando la siguiente canción de la cola."
                    )
                ]
            });
        }

        // ====================================================
        // STOP
        // ====================================================

        if (command === "stop") {

            disconnectVoice(
                guildId,
                true
            );

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🛑 NR MUSIC detenido",
                        "La reproducción se detuvo, la cola fue limpiada y salí del canal de voz."
                    )
                ]
            });
        }

        // ====================================================
        // DISCONNECT
        // ====================================================

        if (command === "disconnect") {

            disconnectVoice(
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
        // QUEUE
        // ====================================================

        if (command === "queue") {

            let description = "";

            if (music.current) {

                description +=
                    `🎶 **Ahora:** ${music.current.title}\n\n`;
            }

            if (!music.queue.length) {

                description +=
                    "📋 La cola está vacía.";

            } else {

                music.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            description +=
                                `\`${index + 1}\` ${song.title}\n`;
                        }
                    );

                if (
                    music.queue.length > 20
                ) {

                    description +=
                        `\n...y ${music.queue.length - 20} más.`;
                }
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "📋 Cola de NR MUSIC",
                        description
                    )
                ]
            });
        }

        // ====================================================
        // NOW PLAYING
        // ====================================================

        if (command === "nowplaying") {

            if (!music.current) {

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
                        `**${music.current.title}**\n\n` +
                        `🔊 Volumen: **${Math.round(music.volume * 100)}%**\n` +
                        `🔁 Loop: **${music.loop ? "Activado" : "Desactivado"}**`
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

            music.volume =
                level / 100;

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🔊 Volumen actualizado",
                        `Volumen: **${level}%**`
                    )
                ]
            });
        }

        // ====================================================
        // LOOP
        // ====================================================

        if (command === "loop") {

            music.loop =
                !music.loop;

            return interaction.reply({
                embeds: [
                    successEmbed(
                        music.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",
                        music.loop
                            ? "La canción actual se repetirá."
                            : "La cola continuará normalmente."
                    )
                ]
            });
        }

        // ====================================================
        // SHUFFLE
        // ====================================================

        if (command === "shuffle") {

            for (
                let i = music.queue.length - 1;
                i > 0;
                i--
            ) {

                const j =
                    Math.floor(
                        Math.random() *
                        (i + 1)
                    );

                [
                    music.queue[i],
                    music.queue[j]
                ] = [
                    music.queue[j],
                    music.queue[i]
                ];
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🔀 Cola mezclada",
                        "Las canciones fueron mezcladas."
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

            if (
                position < 1 ||
                position > music.queue.length
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "❌ Esa posición no existe."
                        )
                    ]
                });
            }

            const removed =
                music.queue.splice(
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

            const amount =
                music.queue.length;

            music.queue = [];

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🧹 Cola limpiada",
                        `Se eliminaron **${amount}** canciones de la cola.`
                    )
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
// MANEJO DE ERRORES
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
