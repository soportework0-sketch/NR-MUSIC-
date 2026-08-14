// ============================================================
// 🎵 NR MUSIC — GLOBAL MUSIC BOT
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
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 10000;

if (!TOKEN) {
    console.error("❌ Falta TOKEN en las variables de entorno.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ Falta CLIENT_ID en las variables de entorno.");
    process.exit(1);
}

// ============================================================
// WEB SERVER
// ============================================================

const app = express();

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
    justify-content: center;
    align-items: center;
    background: #08080d;
    color: white;
    font-family: Arial, sans-serif;
}

.box {
    text-align: center;
    padding: 45px;
    border-radius: 25px;
    background: #12121b;
    box-shadow: 0 20px 70px rgba(0,0,0,.5);
}

.logo {
    font-size: 70px;
}

h1 {
    font-size: 42px;
    margin: 10px 0;
}

.online {
    color: #57f287;
    font-weight: bold;
}

p {
    color: #aaa;
}
</style>
</head>

<body>

<div class="box">

<div class="logo">🎵</div>

<h1>NR MUSIC</h1>

<div class="online">
● ONLINE
</div>

<p>
Global Discord Music Bot
</p>

<p>
🎵 +10 bots en funcionamiento | /help
</p>

</div>

</body>
</html>
`);
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        bot: "NR MUSIC",
        uptime: process.uptime(),
        guilds: client?.guilds?.cache?.size || 0
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server activo en PORT ${PORT}`);
});

// ============================================================
// CLIENT
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

const musicData = new Map();

function getMusic(guildId) {

    if (!musicData.has(guildId)) {

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber:
                    NoSubscriberBehavior.Pause
            }
        });

        const data = {
            player,
            connection: null,

            queue: [],
            current: null,

            volume: 1,
            loop: false,

            textChannel: null,

            ytProcess: null,
            ffmpegProcess: null,

            emptyTimer: null
        };

        player.on(
            AudioPlayerStatus.Idle,
            async () => {

                const music =
                    musicData.get(guildId);

                if (!music) return;

                music.ytProcess = null;
                music.ffmpegProcess = null;

                if (
                    music.current &&
                    music.loop
                ) {

                    await playSong(
                        guildId,
                        music.current
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
                    "❌ AUDIO PLAYER ERROR:",
                    error
                );

                stopProcesses(musicData.get(guildId));

                playNext(guildId);
            }
        );

        musicData.set(
            guildId,
            data
        );
    }

    return musicData.get(guildId);
}

// ============================================================
// EMBEDS
// ============================================================

function success(title, description) {

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        });
}

function error(description) {

    return new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ NR MUSIC")
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        });
}

// ============================================================
// YT-DLP COMMAND
// ============================================================

function runYtDlp(args) {

    return new Promise((resolve, reject) => {

        console.log(
            "▶️ Ejecutando yt-dlp..."
        );

        console.log(
            "📦 Argumentos:",
            args.join(" ")
        );

        const proc = spawn(
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

        let stdout = "";
        let stderr = "";

        proc.stdout.on(
            "data",
            data => {

                stdout +=
                    data.toString();
            }
        );

        proc.stderr.on(
            "data",
            data => {

                const text =
                    data.toString();

                stderr += text;

                console.log(
                    "YT-DLP:",
                    text.trim()
                );
            }
        );

        proc.on(
            "error",
            err => {

                console.error(
                    "❌ No se pudo ejecutar yt-dlp:",
                    err
                );

                reject(err);
            }
        );

        proc.on(
            "close",
            code => {

                console.log(
                    `📦 yt-dlp terminó con código ${code}`
                );

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
// SEARCH
// ============================================================

async function searchSong(query) {

    console.log(
        `🔎 Buscando: ${query}`
    );

    try {

        const result =
            await runYtDlp([
                `ytsearch1:${query}`,

                "--flat-playlist",

                "--dump-single-json",

                "--skip-download",

                "--no-warnings",

                "--no-playlist"
            ]);

        if (!result) {

            return null;
        }

        let data;

        try {

            data =
                JSON.parse(result);

        } catch {

            console.error(
                "❌ JSON inválido:"
            );

            console.error(result);

            return null;
        }

        const video =
            data.entries?.[0] || data;

        if (!video?.id) {

            return null;
        }

        const song = {

            id: video.id,

            title:
                video.title ||
                "Canción desconocida",

            url:
                video.webpage_url ||
                `https://www.youtube.com/watch?v=${video.id}`,

            thumbnail:
                video.thumbnail || null,

            duration:
                video.duration || 0
        };

        console.log(
            `✅ Encontré ${song.title}`
        );

        return song;

    } catch (err) {

        console.error(
            "❌ Error buscando canción:",
            err.message
        );

        return null;
    }
}

// ============================================================
// AUDIO STREAM
// ============================================================

function getAudioStream(url) {

    return new Promise((resolve, reject) => {

        console.log(
            "🎧 Obteniendo audio..."
        );

        const args = [

            "--no-playlist",

            "--no-warnings",

            "--no-progress",

            "--force-ipv4",

            "-f",
            "bestaudio/best",

            "-o",
            "-",

            url
        ];

        console.log(
            "🎧 Ejecutando:",
            "yt-dlp",
            args.join(" ")
        );

        const proc =
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
        let audioStarted = false;

        proc.stdout.once(
            "data",
            () => {

                audioStarted = true;

                console.log(
                    "✅ yt-dlp comenzó a entregar audio."
                );

                resolve(proc);
            }
        );

        proc.stderr.on(
            "data",
            data => {

                const text =
                    data.toString();

                stderr += text;

                console.log(
                    "🎧 yt-dlp:",
                    text.trim()
                );
            }
        );

        proc.on(
            "error",
            err => {

                console.error(
                    "❌ Error yt-dlp:",
                    err
                );

                if (!audioStarted) {
                    reject(err);
                }
            }
        );

        proc.on(
            "close",
            code => {

                console.log(
                    `🎧 yt-dlp audio terminó: ${code}`
                );

                if (
                    !audioStarted &&
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
// FFMPEG
// ============================================================

function startFFmpeg(ytdlp) {

    console.log(
        "🎚️ Iniciando FFmpeg..."
    );

    console.log(
        "🎚️ Ruta FFmpeg:",
        ffmpegPath
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

    ytdlp.stdout.pipe(
        ffmpeg.stdin
    );

    ffmpeg.stderr.on(
        "data",
        data => {

            console.error(
                "FFMPEG:",
                data.toString().trim()
            );
        }
    );

    ffmpeg.on(
        "error",
        err => {

            console.error(
                "❌ FFmpeg error:",
                err
            );
        }
    );

    return ffmpeg;
}

// ============================================================
// STOP PROCESSES
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
// PLAY SONG
// ============================================================

async function playSong(
    guildId,
    song
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

        console.log(
            `▶️ Reproduciendo: ${song.title}`
        );

        return true;

    } catch (err) {

        console.error(
            "======================================"
        );

        console.error(
            "❌ NO SE PUDO OBTENER EL AUDIO"
        );

        console.error(
            err.message
        );

        console.error(
            "======================================"
        );

        stopProcesses(music);

        return false;
    }
}

// ============================================================
// NEXT
// ============================================================

async function playNext(guildId) {

    const music =
        musicData.get(guildId);

    if (!music) return;

    if (!music.connection) {
        return;
    }

    if (!music.queue.length) {

        music.current = null;

        return;
    }

    const song =
        music.queue.shift();

    music.current =
        song;

    const ok =
        await playSong(
            guildId,
            song
        );

    if (!ok) {

        if (music.textChannel) {

            music.textChannel.send({

                embeds: [
                    error(
                        `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.\n\n` +
                        `Revisa el log de Render para ver el error de YouTube.`
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
// JOIN VOICE
// ============================================================

async function connectVoice(
    channel,
    guildId
) {

    const music =
        getMusic(guildId);

    if (music.connection) {

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

            selfDeaf: true,

            selfMute: false
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
// DISCONNECT
// ============================================================

function disconnect(
    guildId,
    clearQueue = true
) {

    const music =
        musicData.get(guildId);

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

    if (clearQueue) {
        music.queue = [];
    }
}

// ============================================================
// AUTO DISCONNECT
// ============================================================

function checkEmpty(guild) {

    const music =
        musicData.get(guild.id);

    if (!music) return;

    const me =
        guild.members.me;

    if (!me) return;

    const channel =
        me.voice.channel;

    if (!channel) return;

    const humans =
        channel.members.filter(
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

    if (music.emptyTimer) return;

    console.log(
        `👥 NR MUSIC está solo en ${guild.name}.`
    );

    music.emptyTimer =
        setTimeout(
            () => {

                const current =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!current) return;

                const users =
                    current.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

                    console.log(
                        `🚪 Saliendo de ${guild.name}`
                    );

                    disconnect(
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
// COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("📚 Muestra los comandos."),

    new SlashCommandBuilder()
        .setName("join")
        .setDescription("🎧 Entra a tu canal de voz."),

    new SlashCommandBuilder()
        .setName("play")
        .setDescription("🎵 Reproduce una canción.")
        .addStringOption(
            o =>
                o
                    .setName("cancion")
                    .setDescription(
                        "Nombre o URL."
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription("⏸️ Pausa."),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription("▶️ Reanuda."),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("⏭️ Salta."),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "🛑 Detiene y desconecta."
        ),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription(
            "🚪 Desconecta."
        ),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription(
            "📋 Muestra la cola."
        ),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription(
            "🎶 Canción actual."
        ),

    new SlashCommandBuilder()
        .setName("volume")
        .setDescription(
            "🔊 Cambia el volumen."
        )
        .addIntegerOption(
            o =>
                o
                    .setName("nivel")
                    .setDescription(
                        "1-100"
                    )
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "🔁 Activa/desactiva loop."
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
            o =>
                o
                    .setName("posicion")
                    .setDescription(
                        "Posición."
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
    x => x.toJSON()
);

// ============================================================
// REGISTER GLOBAL
// ============================================================

async function registerCommands() {

    const rest =
        new REST({
            version: "10"
        }).setToken(
            TOKEN
        );

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
                    error(
                        "Este comando solo funciona en servidores."
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
                    .setTitle("🎵 NR MUSIC")
                    .setDescription(
                        "Bot global de música."
                    )
                    .addFields(

                        {
                            name: "🎧 Voz",
                            value:
                                "`/join`\n`/disconnect`\n`/stop`",
                            inline: true
                        },

                        {
                            name: "🎵 Música",
                            value:
                                "`/play`\n`/pause`\n`/resume`\n`/skip`",
                            inline: true
                        },

                        {
                            name: "📋 Cola",
                            value:
                                "`/queue`\n`/nowplaying`\n`/remove`\n`/clear`\n`/shuffle`",
                            inline: true
                        },

                        {
                            name: "⚙️ Control",
                            value:
                                "`/volume`\n`/loop`",
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
                        error(
                            "🎧 Entra primero a un canal de voz."
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
                        success(
                            "🎧 NR MUSIC conectado",
                            `Entré a **${voice.name}**.`
                        )
                    ]
                });

            } catch (err) {

                console.error(
                    "❌ JOIN:",
                    err
                );

                return interaction.reply({
                    embeds: [
                        error(
                            "No pude conectarme al canal."
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
                        error(
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
                            error(
                                "❌ No encontré esa canción."
                            )
                        ]
                    });
                }

                if (music.current) {

                    music.queue.push(
                        song
                    );

                    return interaction.editReply({
                        embeds: [
                            success(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n\n` +
                                `📍 Posición: **${music.queue.length}**`
                            )
                        ]
                    });
                }

                music.current =
                    song;

                const ok =
                    await playSong(
                        guildId,
                        song
                    );

                if (!ok) {

                    music.current = null;

                    return interaction.editReply({
                        embeds: [
                            error(
                                `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.\n\n` +
                                `📋 Revisa Render → Logs para ver el error real de yt-dlp.`
                            )
                        ]
                    });
                }

                return interaction.editReply({
                    embeds: [
                        success(
                            "🎶 Reproduciendo",
                            `**${song.title}**`
                        )
                    ]
                });

            } catch (err) {

                console.error(
                    "❌ PLAY ERROR:",
                    err
                );

                music.current = null;

                return interaction.editReply({
                    embeds: [
                        error(
                            "❌ Error reproduciendo el audio."
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
                        error(
                            "No hay música."
                        )
                    ]
                });
            }

            music.player.pause();

            return interaction.reply({
                embeds: [
                    success(
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
                        error(
                            "No hay música."
                        )
                    ]
                });
            }

            music.player.unpause();

            return interaction.reply({
                embeds: [
                    success(
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
                        error(
                            "No hay música."
                        )
                    ]
                });
            }

            music.player.stop();

            return interaction.reply({
                embeds: [
                    success(
                        "⏭️ Saltando",
                        "Reproduciendo la siguiente."
                    )
                ]
            });
        }

        // ====================================================
        // STOP
        // ====================================================

        if (command === "stop") {

            disconnect(
                guildId,
                true
            );

            return interaction.reply({
                embeds: [
                    success(
                        "🛑 Detenido",
                        "Música detenida, cola limpiada y bot desconectado."
                    )
                ]
            });
        }

        // ====================================================
        // DISCONNECT
        // ====================================================

        if (command === "disconnect") {

            disconnect(
                guildId,
                false
            );

            return interaction.reply({
                embeds: [
                    success(
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

            let text = "";

            if (music.current) {

                text +=
                    `🎶 **Ahora:** ${music.current.title}\n\n`;
            }

            if (!music.queue.length) {

                text +=
                    "📋 Cola vacía.";

            } else {

                music.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            text +=
                                `\`${index + 1}\` ${song.title}\n`;
                        }
                    );
            }

            return interaction.reply({
                embeds: [
                    success(
                        "📋 Cola",
                        text
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
                        error(
                            "No hay ninguna canción."
                        )
                    ]
                });
            }

            return interaction.reply({
                embeds: [
                    success(
                        "🎶 Reproduciendo",
                        `**${music.current.title}**`
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
                    success(
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

            music.loop =
                !music.loop;

            return interaction.reply({
                embeds: [
                    success(
                        music.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",
                        music.loop
                            ? "Se repetirá la canción actual."
                            : "La reproducción continuará normalmente."
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
                    success(
                        "🔀 Cola mezclada",
                        "La cola fue mezclada."
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
                        error(
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
                    success(
                        "🗑️ Eliminada",
                        `Eliminé **${removed.title}**.`
                    )
                ]
            });
        }

        // ====================================================
        // CLEAR
        // ====================================================

        if (command === "clear") {

            const count =
                music.queue.length;

            music.queue = [];

            return interaction.reply({
                embeds: [
                    success(
                        "🧹 Cola limpiada",
                        `Eliminé **${count}** canciones de la cola.`
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

        try {

            await registerCommands();

        } catch (err) {

            console.error(
                "❌ Error registrando comandos:",
                err
            );
        }
    }
);

// ============================================================
// ERROR HANDLING
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
