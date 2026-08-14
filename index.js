// ============================================================
// 🎵 NR MUSIC — GLOBAL MUSIC BOT
// ============================================================
// Requisitos:
// - Node.js 24+
// - FFmpeg
// - yt-dlp
// - discord.js
// - @discordjs/voice
// - express
//
// Variables de entorno:
// TOKEN
// CLIENT_ID
// PORT (opcional)
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
const PORT = process.env.PORT || 10000;

// Tiempo que permanece solo antes de salir
const AUTO_DISCONNECT = 5 * 60 * 1000;

if (!TOKEN) {
    console.error("❌ TOKEN no configurado.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID no configurado.");
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
<meta name="viewport" content="width=device-width,initial-scale=1">
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
    background: #08080d;
    color: white;
    font-family: Arial, sans-serif;
}

.container {
    width: 90%;
    max-width: 650px;
    padding: 50px 30px;
    text-align: center;
    border-radius: 25px;
    background: #12121a;
    border: 1px solid #292936;
    box-shadow: 0 20px 80px rgba(0,0,0,.5);
}

.logo {
    font-size: 70px;
}

h1 {
    font-size: 45px;
    margin: 10px 0;
}

.status {
    display: inline-block;
    padding: 9px 18px;
    border-radius: 50px;
    background: #14351f;
    color: #57f287;
    font-weight: bold;
}

p {
    color: #aaa;
}

.small {
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

// ============================================================
// CREAR SESIÓN MUSICAL
// ============================================================

function getGuildMusic(guildId) {

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

        ytProcess: null,

        ffmpegProcess: null,

        starting: false
    };

    // --------------------------------------------------------
    // PLAYER IDLE
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.Idle,
        async () => {

            const current = music.get(guildId);

            if (!current) {
                return;
            }

            current.ytProcess = null;
            current.ffmpegProcess = null;

            if (current.current) {

                if (current.loop) {

                    const song = current.current;

                    const success =
                        await startSong(
                            guildId,
                            song
                        );

                    if (!success) {

                        current.current = null;
                        current.loop = false;

                        await playNext(guildId);
                    }

                    return;
                }

                current.current = null;
            }

            await playNext(guildId);
        }
    );

    // --------------------------------------------------------
    // PLAYER ERROR
    // --------------------------------------------------------

    player.on(
        "error",
        async error => {

            console.error(
                "❌ AudioPlayer:",
                error
            );

            const current = music.get(guildId);

            if (!current) {
                return;
            }

            killProcesses(current);

            current.current = null;

            await playNext(guildId);
        }
    );

    music.set(
        guildId,
        data
    );

    return data;
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

function executeYTDLP(args) {

    return new Promise((resolve, reject) => {

        const process = spawn(
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

        process.stdout.on(
            "data",
            chunk => {
                stdout += chunk.toString();
            }
        );

        process.stderr.on(
            "data",
            chunk => {
                stderr += chunk.toString();
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

                if (code !== 0) {

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );

                    return;
                }

                resolve(
                    stdout.trim()
                );
            }
        );
    });
}

// ============================================================
// BUSCAR CANCIÓN
// ============================================================

async function searchSong(query) {

    try {

        let target = query;

        // Si no parece una URL,
        // buscamos en YouTube.
        if (
            !/^https?:\/\//i.test(query)
        ) {

            target =
                `ytsearch1:${query}`;
        }

        const output =
            await executeYTDLP([
                "--dump-single-json",
                "--flat-playlist",
                "--no-warnings",
                "--skip-download",
                target
            ]);

        const data =
            JSON.parse(output);

        const entry =
            data.entries?.[0] || data;

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

        if (!url) {
            return null;
        }

        return {

            title:
                entry.title ||
                "Canción desconocida",

            url,

            id:
                entry.id || null,

            duration:
                entry.duration || 0,

            thumbnail:
                entry.thumbnail || null
        };

    } catch (error) {

        console.error(
            "❌ Error buscando canción:",
            error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER AUDIO
// ============================================================

function createYTDLPStream(url) {

    return new Promise((resolve, reject) => {

        const args = [

            "--no-playlist",

            "--quiet",

            "--no-warnings",

            "--no-progress",

            "--newline",

            // Formato de audio
            "-f",
            "bestaudio/best",

            // Salida por stdout
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
            chunk => {

                stderr +=
                    chunk.toString();

            }
        );

        process.on(
            "error",
            error => {

                reject(error);

            }
        );

        process.stdout.once(
            "data",
            () => {

                resolve(process);

            }
        );

        process.on(
            "close",
            code => {

                if (code !== 0) {

                    console.error(
                        "❌ yt-dlp:",
                        stderr
                    );

                }

            }
        );

        // Evita que un fallo silencioso
        // deje la Promise esperando
        setTimeout(
            () => {

                if (
                    process.exitCode !== null
                ) {
                    return;
                }

                if (
                    process.stdout
                ) {

                    resolve(process);

                }

            },
            2500
        );
    });
}

// ============================================================
// FFMPEG
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

    ffmpeg.stderr.on(
        "data",
        chunk => {

            const text =
                chunk.toString().trim();

            if (text) {

                console.error(
                    "FFmpeg:",
                    text
                );

            }
        }
    );

    return ffmpeg;
}

// ============================================================
// MATAR PROCESOS
// ============================================================

function killProcesses(data) {

    if (!data) {
        return;
    }

    if (data.ytProcess) {

        try {
            data.ytProcess.kill(
                "SIGKILL"
            );
        } catch {}

        data.ytProcess = null;
    }

    if (data.ffmpegProcess) {

        try {
            data.ffmpegProcess.kill(
                "SIGKILL"
            );
        } catch {}

        data.ffmpegProcess = null;
    }
}

// ============================================================
// INICIAR CANCIÓN
// ============================================================

async function startSong(
    guildId,
    song
) {

    const data =
        getGuildMusic(guildId);

    killProcesses(data);

    try {

        console.log(
            `🔎 Obteniendo audio: ${song.title}`
        );

        const ytProcess =
            await createYTDLPStream(
                song.url
            );

        data.ytProcess =
            ytProcess;

        console.log(
            `🎛️ Iniciando FFmpeg: ${song.title}`
        );

        const ffmpeg =
            createFFmpeg(
                ytProcess
            );

        data.ffmpegProcess =
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
                data.volume / 100
            );
        }

        data.player.play(
            resource
        );

        console.log(
            `▶️ Reproduciendo: ${song.title}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ No se pudo obtener el audio:",
            error.message
        );

        killProcesses(data);

        return false;
    }
}

// ============================================================
// SIGUIENTE CANCIÓN
// ============================================================

async function playNext(guildId) {

    const data =
        music.get(guildId);

    if (!data) {
        return;
    }

    if (!data.connection) {
        return;
    }

    if (
        data.queue.length === 0
    ) {

        data.current = null;

        return;
    }

    const next =
        data.queue.shift();

    data.current =
        next;

    const success =
        await startSong(
            guildId,
            next
        );

    if (!success) {

        data.current = null;

        if (data.textChannel) {

            await data.textChannel.send({
                embeds: [
                    errorEmbed(
                        `🔎 Encontré **${next.title}**, pero no puedo obtener su audio en este momento.`
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

        const embed =
            successEmbed(
                "🎶 Reproduciendo ahora",
                `**${next.title}**`
            );

        if (next.thumbnail) {

            embed.setThumbnail(
                next.thumbnail
            );
        }

        await data.textChannel.send({
            embeds: [embed]
        }).catch(() => {});
    }
}

// ============================================================
// CONECTAR AL VC
// ============================================================

async function connectToVoice(
    channel,
    guildId
) {

    const data =
        getGuildMusic(guildId);

    if (data.emptyTimer) {

        clearTimeout(
            data.emptyTimer
        );

        data.emptyTimer = null;
    }

    if (
        data.connection &&
        data.connection.state.status !==
            VoiceConnectionStatus.Destroyed
    ) {

        return data.connection;
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
                        VoiceConnectionStatus.Connecting,
                        5_000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
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

    const data =
        music.get(guildId);

    if (!data) {
        return;
    }

    if (data.emptyTimer) {

        clearTimeout(
            data.emptyTimer
        );

        data.emptyTimer = null;
    }

    killProcesses(data);

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

    if (!guild) {
        return;
    }

    const data =
        music.get(guild.id);

    if (!data) {
        return;
    }

    if (!data.connection) {
        return;
    }

    const me =
        guild.members.me;

    if (!me?.voice?.channel) {
        return;
    }

    const channel =
        me.voice.channel;

    const humans =
        channel.members.filter(
            member =>
                !member.user.bot
        );

    // Hay personas
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

    console.log(
        `⏱️ NR MUSIC está solo en ${guild.name}.`
    );

    data.emptyTimer =
        setTimeout(
            () => {

                const current =
                    music.get(guild.id);

                if (!current?.connection) {
                    return;
                }

                const voice =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!voice) {

                    disconnectGuild(
                        guild.id,
                        true
                    );

                    return;
                }

                const users =
                    voice.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

                    console.log(
                        `🚪 NR MUSIC salió de ${guild.name}.`
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
            "🎧 Entra al canal de voz donde estás."
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
                        "Nombre, búsqueda o URL."
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
                        "Volumen de 1 a 100."
                    )
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "🔁 Activa o desactiva la repetición."
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
        ),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription(
            "🚪 Desconecta al bot."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Muestra los comandos."
        )

].map(
    command => command.toJSON()
);

// ============================================================
// REGISTRAR COMANDOS
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

        const command =
            interaction.commandName;

        // ====================================================
        // /HELP
        // ====================================================

        if (command === "help") {

            const embed =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(
                        "🎵 NR MUSIC"
                    )
                    .setDescription(
                        "Bot global de música para Discord.\n\n" +
                        "Usa `/play <canción>` para empezar."
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
                        },

                        {
                            name: "🔴 ESTADO",
                            value:
                                "DND\n" +
                                "🎵 +10 bots en funcionamiento | /help",
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "NR MUSIC • Global"
                    })
                    .setTimestamp();

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // /JOIN
        // ====================================================

        if (command === "join") {

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

            try {

                const data =
                    getGuildMusic(
                        guildId
                    );

                await connectToVoice(
                    voice,
                    guildId
                );

                data.textChannel =
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
                    "❌ /join:",
                    error
                );

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
        // /PLAY
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
                getGuildMusic(
                    guildId
                );

            data.textChannel =
                interaction.channel;

            try {

                // Conectar automáticamente
                if (!data.connection) {

                    await connectToVoice(
                        voice,
                        guildId
                    );

                }

                // Verificar canal
                const botChannel =
                    guild.members.me
                        ?.voice
                        ?.channelId;

                if (
                    botChannel &&
                    botChannel !== voice.id
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

                console.log(
                    `🔎 Buscando: ${query}`
                );

                const song =
                    await searchSong(
                        query
                    );

                if (!song) {

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "No encontré esa canción."
                            )
                        ]
                    });
                }

                console.log(
                    `✅ Canción encontrada: ${song.title}`
                );

                // Si hay canción reproduciéndose,
                // agregar a cola.
                if (
                    data.current &&
                    (
                        data.player.state.status ===
                            AudioPlayerStatus.Playing ||

                        data.player.state.status ===
                            AudioPlayerStatus.Paused
                    )
                ) {

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

                // Primera canción
                data.current =
                    song;

                const success =
                    await startSong(
                        guildId,
                        song
                    );

                if (!success) {

                    data.current = null;

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                            )
                        ]
                    });
                }

                const embed =
                    successEmbed(
                        "🎶 Reproduciendo",
                        `**${song.title}**`
                    );

                if (song.thumbnail) {

                    embed.setThumbnail(
                        song.thumbnail
                    );
                }

                return interaction.editReply({
                    embeds: [embed]
                });

            } catch (error) {

                console.error(
                    "❌ ERROR /PLAY:",
                    error
                );

                data.current = null;

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
        // /PAUSE
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
        // /RESUME
        // ====================================================

        if (command === "resume") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción."
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
        // /SKIP
        // ====================================================

        if (command === "skip") {

            const data =
                music.get(guildId);

            if (!data?.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción."
                        )
                    ]
                });
            }

            data.player.stop();

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "⏭️ Saltada",
                        "Reproduciendo la siguiente canción..."
                    )
                ]
            });
        }

        // ====================================================
        // /STOP
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
                        "🛑 Música detenida",
                        "Se detuvo la reproducción, se limpió la cola y NR MUSIC salió del VC."
                    )
                ]
            });
        }

        // ====================================================
        // /QUEUE
        // ====================================================

        if (command === "queue") {

            const data =
                getGuildMusic(
                    guildId
                );

            if (
                !data.current &&
                data.queue.length === 0
            ) {

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "📋 Cola vacía",
                            "No hay canciones en la cola."
                        )
                    ]
                });
            }

            let description = "";

            if (data.current) {

                description +=
                    `🎶 **Ahora:** ${data.current.title}\n\n`;
            }

            if (data.queue.length > 0) {

                description +=
                    "📋 **Siguiente:**\n\n";

                data.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            description +=
                                `\`${index + 1}\` ${song.title}\n`;
                        }
                    );

                if (
                    data.queue.length > 20
                ) {

                    description +=
                        `\n... y ${data.queue.length - 20} más.`;
                }
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "📋 Cola",
                        description
                    )
                ]
            });
        }

        // ====================================================
        // /NOWPLAYING
        // ====================================================

        if (
            command === "nowplaying"
        ) {

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
        // /VOLUME
        // ====================================================

        if (command === "volume") {

            const level =
                interaction.options.getInteger(
                    "nivel"
                );

            const data =
                getGuildMusic(
                    guildId
                );

            data.volume =
                level;

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🔊 Volumen",
                        `Volumen establecido en **${level}%**.`
                    )
                ]
            });
        }

        // ====================================================
        // /LOOP
        // ====================================================

        if (command === "loop") {

            const data =
                getGuildMusic(
                    guildId
                );

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
                            : "La reproducción continuará normalmente."
                    )
                ]
            });
        }

        // ====================================================
        // /SHUFFLE
        // ====================================================

        if (command === "shuffle") {

            const data =
                getGuildMusic(
                    guildId
                );

            if (
                data.queue.length < 2
            ) {

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
                        Math.random() *
                        (i + 1)
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
        // /REMOVE
        // ====================================================

        if (command === "remove") {

            const position =
                interaction.options.getInteger(
                    "posicion"
                );

            const data =
                getGuildMusic(
                    guildId
                );

            if (
                position < 1 ||
                position > data.queue.length
            ) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Esa posición no existe."
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
                        "🗑️ Eliminada",
                        `Eliminé **${removed.title}** de la cola.`
                    )
                ]
            });
        }

        // ====================================================
        // /CLEAR
        // ====================================================

        if (command === "clear") {

            const data =
                getGuildMusic(
                    guildId
                );

            const amount =
                data.queue.length;

            data.queue = [];

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "🧹 Cola limpiada",
                        `Se eliminaron **${amount}** canciones.`
                    )
                ]
            });
        }

        // ====================================================
        // /DISCONNECT
        // ====================================================

        if (
            command === "disconnect"
        ) {

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

        // DND SIEMPRE
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

client.login(TOKEN);
