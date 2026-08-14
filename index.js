// ============================================================
// 🎵 NR MUSIC — GLOBAL DISCORD MUSIC BOT
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

const AUTO_DISCONNECT_TIME = 5 * 60 * 1000;

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

    background:
        radial-gradient(circle at top, #25254a 0%, #0b0b11 45%, #050507 100%);

    color: white;
    font-family: Arial, sans-serif;
}

.card {
    width: 90%;
    max-width: 650px;

    padding: 50px 30px;

    text-align: center;

    border-radius: 25px;

    background: rgba(20, 20, 30, .95);

    border: 1px solid rgba(255,255,255,.08);

    box-shadow:
        0 25px 100px rgba(0,0,0,.6);
}

.logo {
    font-size: 70px;
}

h1 {
    margin: 10px 0;

    font-size: 46px;
}

.status {
    display: inline-block;

    padding: 8px 18px;

    border-radius: 50px;

    background: rgba(35, 200, 90, .15);

    color: #57f287;

    font-weight: bold;
}

.description {
    color: #aaa;
    margin-top: 20px;
}

.footer {
    margin-top: 30px;

    font-size: 13px;

    color: #666;
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

    <p class="description">
        Global Discord Music Bot
    </p>

    <p>
        🎵 +10 bots en funcionamiento | /help
    </p>

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
        online: true,
        bot: "NR MUSIC",
        guilds: client?.guilds?.cache?.size || 0,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });

});

app.listen(PORT, () => {

    console.log(
        `🌐 Web server activo en PORT ${PORT}`
    );

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
// SERVIDORES / MÚSICA
// ============================================================

const music = new Map();

// ============================================================
// CREAR DATOS DEL SERVIDOR
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

        ffmpegProcess: null

    };

    // --------------------------------------------------------
    // CUANDO TERMINA UNA CANCIÓN
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.Idle,
        async () => {

            const current =
                music.get(guildId);

            if (!current) {
                return;
            }

            current.ytProcess = null;
            current.ffmpegProcess = null;

            // Loop
            if (
                current.current &&
                current.loop
            ) {

                const song =
                    current.current;

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

            await playNext(guildId);

        }
    );

    // --------------------------------------------------------
    // ERROR DEL PLAYER
    // --------------------------------------------------------

    player.on(
        "error",
        async error => {

            console.error(
                "❌ Error del reproductor:",
                error
            );

            killProcesses(currentData(guildId));

            const current =
                music.get(guildId);

            if (!current) {
                return;
            }

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

function currentData(guildId) {

    return music.get(guildId);

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

        if (
            !/^https?:\/\//i.test(query)
        ) {

            target =
                `ytsearch1:${query}`;

        }

        console.log(
            `🔎 Buscando en YouTube: ${target}`
        );

        const output =
            await runYTDLP([

                "--dump-single-json",

                "--flat-playlist",

                "--skip-download",

                "--no-warnings",

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
            "❌ ERROR COMPLETO DE BÚSQUEDA YT-DLP:"
        );

        console.error(
            error.message
        );

        return null;

    }

}

// ============================================================
// CREAR STREAM DE YT-DLP
// ============================================================

function createYTDLPStream(url) {

    return new Promise((resolve, reject) => {

        const args = [

            "--no-playlist",

            "--no-warnings",

            "--no-progress",

            "--quiet",

            "-f",
            "bestaudio",

            "--extractor-args",
            "youtube:player_client=android,web",

            "-o",
            "-",

            url

        ];

        console.log(
            "🎧 Ejecutando yt-dlp:"
        );

        console.log(
            "yt-dlp " + args.join(" ")
        );

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

        let resolved = false;

        process.stderr.on(
            "data",
            chunk => {

                const text =
                    chunk.toString();

                stderr += text;

                console.error(
                    "🎧 yt-dlp:",
                    text.trim()
                );

            }
        );

        process.on(
            "error",
            error => {

                if (!resolved) {

                    resolved = true;

                    reject(error);

                }

            }
        );

        process.stdout.once(
            "data",
            () => {

                if (!resolved) {

                    resolved = true;

                    resolve(process);

                }

            }
        );

        process.on(
            "close",
            code => {

                if (
                    code !== 0 &&
                    !resolved
                ) {

                    resolved = true;

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );

                }

            }
        );

        // Fallback para streams lentos
        setTimeout(
            () => {

                if (
                    resolved
                ) {
                    return;
                }

                if (
                    process.exitCode === null
                ) {

                    resolved = true;

                    resolve(process);

                }

            },
            3000
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
                    "🎚️ FFmpeg:",
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
// REPRODUCIR CANCIÓN
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
            `🎵 Intentando obtener audio: ${song.title}`
        );

        const ytProcess =
            await createYTDLPStream(
                song.url
            );

        data.ytProcess =
            ytProcess;

        console.log(
            "🎧 yt-dlp conectado correctamente."
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

        if (
            resource.volume
        ) {

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
            "================================================"
        );

        console.error(
            "❌ NO SE PUDO OBTENER EL AUDIO"
        );

        console.error(
            error
        );

        console.error(
            "================================================"
        );

        killProcesses(data);

        return false;

    }

}

// ============================================================
// SIGUIENTE
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

    const song =
        data.queue.shift();

    data.current =
        song;

    const success =
        await startSong(
            guildId,
            song
        );

    if (!success) {

        data.current = null;

        if (
            data.textChannel
        ) {

            await data.textChannel.send({

                embeds: [

                    errorEmbed(
                        `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                    )

                ]

            }).catch(
                () => {}
            );

        }

        await playNext(
            guildId
        );

        return;

    }

    if (
        data.textChannel
    ) {

        const embed =
            successEmbed(
                "🎶 Reproduciendo ahora",
                `**${song.title}**`
            );

        if (
            song.thumbnail
        ) {

            embed.setThumbnail(
                song.thumbnail
            );

        }

        await data.textChannel.send({
            embeds: [embed]
        }).catch(
            () => {}
        );

    }

}

// ============================================================
// CONECTAR
// ============================================================

async function connectToVoice(
    channel,
    guildId
) {

    const data =
        getGuildMusic(guildId);

    if (
        data.emptyTimer
    ) {

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
            15000
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
                        5000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
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

    if (
        data.emptyTimer
    ) {

        clearTimeout(
            data.emptyTimer
        );

        data.emptyTimer = null;

    }

    killProcesses(data);

    try {

        data.player.stop(
            true
        );

    } catch {}

    if (
        data.connection
    ) {

        try {

            data.connection.destroy();

        } catch {}

    }

    data.connection = null;

    data.current = null;

    if (
        clearQueue
    ) {

        data.queue = [];

    }

}

// ============================================================
// AUTO-DESCONEXIÓN
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

    if (
        humans.size > 0
    ) {

        if (
            data.emptyTimer
        ) {

            clearTimeout(
                data.emptyTimer
            );

            data.emptyTimer = null;

        }

        return;

    }

    if (
        data.emptyTimer
    ) {
        return;
    }

    console.log(
        `⏱️ NR MUSIC está solo en ${guild.name}. Desconexión en 5 minutos.`
    );

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

                if (
                    users.size === 0
                ) {

                    console.log(
                        `🚪 NR MUSIC salió de ${guild.name}.`
                    );

                    disconnectGuild(
                        guild.id,
                        true
                    );

                }

            },
            AUTO_DISCONNECT_TIME
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
// COMANDOS
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
                        "Volumen de 1 a 100."
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
            "🚪 Saca al bot del VC."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Muestra los comandos."
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
        // HELP
        // ====================================================

        if (
            command === "help"
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(0x5865F2)

                    .setTitle(
                        "🎵 NR MUSIC"
                    )

                    .setDescription(
                        "Bot global de música para Discord.\n\n" +
                        "Usa `/play <canción>` para comenzar."
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
                            name: "🎵 MÚSICA",
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
                            name: "🔴 PRESENCIA",
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
        // JOIN
        // ====================================================

        if (
            command === "join"
        ) {

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
                    "❌ Error /join:",
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
        // PLAY
        // ====================================================

        if (
            command === "play"
        ) {

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

                // Conectar
                if (
                    !data.connection
                ) {

                    await connectToVoice(
                        voice,
                        guildId
                    );

                }

                // Comprobar canal
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
                    `✅ Encontré: ${song.title}`
                );

                // Si hay algo reproduciendo
                if (
                    data.current
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

                if (
                    song.thumbnail
                ) {

                    embed.setThumbnail(
                        song.thumbnail
                    );

                }

                return interaction.editReply({
                    embeds: [embed]
                });

            } catch (error) {

                console.error(
                    "❌ ERROR COMPLETO EN /PLAY:"
                );

                console.error(
                    error
                );

                data.current = null;

                return interaction.editReply({

                    embeds: [

                        errorEmbed(

                            `🔎 Encontré la canción, pero no puedo obtener su audio.\n\n` +
                            `Revisa los logs de Render para ver el error de **yt-dlp/FFmpeg**.`

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

        if (
            command === "resume"
        ) {

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
        // SKIP
        // ====================================================

        if (
            command === "skip"
        ) {

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
                        "Reproduciendo la siguiente..."
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
                        "Música detenida, cola limpiada y bot desconectado."
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
                            "No hay canciones."
                        )
                    ]

                });

            }

            let description = "";

            if (
                data.current
            ) {

                description +=
                    `🎶 **Ahora:** ${data.current.title}\n\n`;

            }

            if (
                data.queue.length
            ) {

                description +=
                    "📋 **Cola:**\n\n";

                data.queue
                    .slice(0, 20)
                    .forEach(
                        (song, index) => {

                            description +=
                                `\`${index + 1}\` ${song.title}\n`;

                        }
                    );

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
        // NOW PLAYING
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
                            "No hay ninguna canción."
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

        if (
            command === "volume"
        ) {

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
                        "🔊 Volumen cambiado",
                        `Volumen: **${level}%**`
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
                            : "La canción continuará normalmente."

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
                            "Necesitas al menos 2 canciones."
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
        // REMOVE
        // ====================================================

        if (
            command === "remove"
        ) {

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
                        `Eliminé **${removed.title}**.`
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
        // DISCONNECT
        // ====================================================

        if (
            command === "disconnect"
        ) {

            const data =
                music.get(guildId);

            if (
                !data?.connection
            ) {

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
