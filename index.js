const express = require("express");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

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
    StreamType
} = require("@discordjs/voice");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 10000;

if (!TOKEN) {
    console.error("❌ Falta TOKEN.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ Falta CLIENT_ID.");
    process.exit(1);
}

console.log("🎵 Iniciando NR MUSIC...");

// ======================================================
// WEB
// ======================================================

const app = express();

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head>
            <title>NR MUSIC</title>
            <style>
                body {
                    background:#08080d;
                    color:white;
                    font-family:Arial;
                    display:flex;
                    justify-content:center;
                    align-items:center;
                    min-height:100vh;
                    margin:0;
                }

                .box {
                    background:#11111a;
                    padding:45px;
                    border-radius:25px;
                    text-align:center;
                    box-shadow:0 0 60px rgba(0,0,0,.5);
                }

                h1 {
                    font-size:42px;
                }

                .online {
                    color:#57f287;
                    font-weight:bold;
                }
            </style>
        </head>

        <body>
            <div class="box">
                <div style="font-size:65px;">🎵</div>
                <h1>NR MUSIC</h1>
                <div class="online">● ONLINE</div>
                <p>Global Discord Music Bot</p>
                <p>🎵 +10 bots en funcionamiento | /help</p>
            </div>
        </body>
        </html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        bot: "NR MUSIC",
        guilds: client?.guilds?.cache?.size || 0
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server activo en PORT ${PORT}`);
});

// ======================================================
// DISCORD
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ======================================================
// SERVIDORES
// ======================================================

const servers = new Map();

function getServer(guildId) {

    if (!servers.has(guildId)) {

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
            emptyTimer: null
        };

        player.on(
            AudioPlayerStatus.Idle,
            async () => {

                const server = servers.get(guildId);

                if (!server) return;

                server.ytProcess = null;

                if (
                    server.current &&
                    server.loop
                ) {

                    await playSong(
                        guildId,
                        server.current
                    );

                    return;
                }

                server.current = null;

                await nextSong(guildId);
            }
        );

        player.on("error", error => {

            console.error(
                "❌ Error del reproductor:",
                error
            );

            const server =
                servers.get(guildId);

            if (!server) return;

            killProcess(server);

            server.current = null;

            nextSong(guildId);
        });

        servers.set(
            guildId,
            data
        );
    }

    return servers.get(guildId);
}

// ======================================================
// EMBEDS
// ======================================================

function ok(title, description) {

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

// ======================================================
// YT-DLP
// ======================================================

function runYTDLP(args) {

    return new Promise((resolve, reject) => {

        const process =
            spawn("yt-dlp", args);

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

// ======================================================
// BUSCAR
// ======================================================

async function searchSong(query) {

    console.log(
        `🔎 Buscando: ${query}`
    );

    try {

        const output =
            await runYTDLP([

                `ytsearch1:${query}`,

                "--flat-playlist",

                "--dump-single-json",

                "--skip-download",

                "--no-warnings"

            ]);

        console.log(
            "📡 Respuesta recibida de yt-dlp."
        );

        if (!output) {

            console.log(
                "❌ yt-dlp no devolvió resultados."
            );

            return null;
        }

        let data;

        try {

            data =
                JSON.parse(output);

        } catch (err) {

            console.error(
                "❌ No se pudo interpretar la respuesta de yt-dlp:"
            );

            console.error(
                output
            );

            return null;
        }

        const video =
            data.entries?.[0] || data;

        if (!video) {

            console.log(
                "❌ No hay resultados."
            );

            return null;
        }

        const id =
            video.id;

        if (!id) {

            console.log(
                "❌ El resultado no tiene ID."
            );

            return null;
        }

        const song = {

            title:
                video.title ||
                "Canción desconocida",

            id,

            url:
                `https://www.youtube.com/watch?v=${id}`,

            thumbnail:
                video.thumbnail || null,

            duration:
                video.duration || 0

        };

        console.log(
            `✅ Encontré: ${song.title}`
        );

        return song;

    } catch (err) {

        console.error(
            "❌ ERROR DE YT-DLP:"
        );

        console.error(
            err.message
        );

        return null;
    }
}

// ======================================================
// AUDIO
// ======================================================

function getAudioProcess(url) {

    return new Promise((resolve, reject) => {

        const args = [

            "--no-playlist",

            "--no-warnings",

            "--no-progress",

            "-f",
            "bestaudio",

            "--extractor-args",
            "youtube:player_client=android,web",

            "-o",
            "-",

            url

        ];

        console.log(
            "🎧 Obteniendo audio..."
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
        let settled = false;

        process.stderr.on(
            "data",
            data => {

                const text =
                    data.toString();

                stderr += text;

                console.error(
                    "🎧 yt-dlp:",
                    text.trim()
                );
            }
        );

        process.on(
            "error",
            err => {

                if (!settled) {

                    settled = true;

                    reject(err);
                }
            }
        );

        process.stdout.once(
            "data",
            () => {

                if (!settled) {

                    settled = true;

                    resolve(process);
                }
            }
        );

        process.on(
            "close",
            code => {

                if (
                    code !== 0 &&
                    !settled
                ) {

                    settled = true;

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp terminó con código ${code}`
                        )
                    );
                }
            }
        );

        setTimeout(
            () => {

                if (
                    !settled &&
                    process.exitCode === null
                ) {

                    settled = true;

                    resolve(process);
                }

            },
            3000
        );
    });
}

// ======================================================
// FFmpeg
// ======================================================

function convertAudio(ytdlp) {

    console.log(
        "🎚️ Iniciando FFmpeg..."
    );

    console.log(
        "🎚️ FFmpeg:",
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

    return ffmpeg;
}

// ======================================================
// MATAR PROCESO
// ======================================================

function killProcess(server) {

    if (!server) return;

    if (server.ytProcess) {

        try {
            server.ytProcess.kill(
                "SIGKILL"
            );
        } catch {}

        server.ytProcess = null;
    }
}

// ======================================================
// REPRODUCIR
// ======================================================

async function playSong(
    guildId,
    song
) {

    const server =
        getServer(guildId);

    killProcess(server);

    try {

        const ytdlp =
            await getAudioProcess(
                song.url
            );

        server.ytProcess =
            ytdlp;

        const ffmpeg =
            convertAudio(
                ytdlp
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
                server.volume
            );
        }

        server.player.play(
            resource
        );

        console.log(
            `▶️ Reproduciendo: ${song.title}`
        );

        return true;

    } catch (err) {

        console.error(
            "❌ ERROR OBTENIENDO AUDIO:"
        );

        console.error(
            err.message
        );

        killProcess(server);

        return false;
    }
}

// ======================================================
// SIGUIENTE
// ======================================================

async function nextSong(guildId) {

    const server =
        servers.get(guildId);

    if (!server) return;

    if (!server.connection) return;

    if (!server.queue.length) {

        server.current = null;

        return;
    }

    const song =
        server.queue.shift();

    server.current =
        song;

    const success =
        await playSong(
            guildId,
            song
        );

    if (!success) {

        server.current = null;

        if (server.textChannel) {

            server.textChannel.send({

                embeds: [
                    errorEmbed(
                        `🔎 Encontré **${song.title}**, pero no puedo obtener su audio en este momento.`
                    )
                ]

            }).catch(
                () => {}
            );
        }

        await nextSong(
            guildId
        );

        return;
    }

    if (server.textChannel) {

        server.textChannel.send({

            embeds: [
                ok(
                    "🎶 Reproduciendo ahora",
                    `**${song.title}**`
                )
            ]

        }).catch(
            () => {}
        );
    }
}

// ======================================================
// JOIN
// ======================================================

async function connect(
    channel,
    guildId
) {

    const server =
        getServer(guildId);

    if (server.connection) {

        return server.connection;
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

    server.connection =
        connection;

    connection.subscribe(
        server.player
    );

    return connection;
}

// ======================================================
// DISCONNECT
// ======================================================

function disconnect(
    guildId,
    clearQueue = true
) {

    const server =
        servers.get(guildId);

    if (!server) return;

    killProcess(server);

    try {
        server.player.stop(
            true
        );
    } catch {}

    if (server.connection) {

        try {
            server.connection.destroy();
        } catch {}
    }

    server.connection = null;
    server.current = null;

    if (clearQueue) {

        server.queue = [];
    }
}

// ======================================================
// AUTO DISCONNECT
// ======================================================

function checkEmpty(guild) {

    const server =
        servers.get(guild.id);

    if (!server) return;

    const voice =
        guild.members.me?.voice?.channel;

    if (!voice) return;

    const humans =
        voice.members.filter(
            member =>
                !member.user.bot
        );

    if (humans.size > 0) {

        if (server.emptyTimer) {

            clearTimeout(
                server.emptyTimer
            );

            server.emptyTimer = null;
        }

        return;
    }

    if (server.emptyTimer) return;

    server.emptyTimer =
        setTimeout(
            () => {

                const channel =
                    guild.members.me
                        ?.voice
                        ?.channel;

                if (!channel) return;

                const users =
                    channel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (users.size === 0) {

                    console.log(
                        `🚪 NR MUSIC salió de ${guild.name}`
                    );

                    disconnect(
                        guild.id,
                        true
                    );
                }

            },
            5 * 60 * 1000
        );
}

// ======================================================
// VOICE STATE
// ======================================================

client.on(
    "voiceStateUpdate",
    (oldState, newState) => {

        const guild =
            newState.guild ||
            oldState.guild;

        checkEmpty(guild);
    }
);

// ======================================================
// COMANDOS
// ======================================================

const commands = [

    new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "🎧 Entra a tu canal de voz."
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
                        "Nombre o URL."
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription(
            "⏸️ Pausa."
        ),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "▶️ Reanuda."
        ),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription(
            "⏭️ Salta."
        ),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "🛑 Detiene y desconecta."
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
            "🔊 Cambia volumen."
        )
        .addIntegerOption(
            option =>
                option
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
            "🗑️ Elimina una posición."
        )
        .addIntegerOption(
            option =>
                option
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
        ),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription(
            "🚪 Desconecta."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "📚 Ayuda."
        )

].map(
    command =>
        command.toJSON()
);

// ======================================================
// REGISTRAR
// ======================================================

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

    } catch (err) {

        console.error(
            "❌ Error registrando comandos:",
            err
        );
    }
}

// ======================================================
// INTERACCIONES
// ======================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) return;

        const guild =
            interaction.guild;

        if (!guild) {

            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Este comando solo funciona en servidores."
                    )
                ],
                ephemeral: true
            });
        }

        const id =
            guild.id;

        const server =
            getServer(id);

        const command =
            interaction.commandName;

        // ==================================================
        // HELP
        // ==================================================

        if (command === "help") {

            const embed =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(
                        "🎵 NR MUSIC"
                    )
                    .setDescription(
                        "Bot global de música para Discord."
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

        // ==================================================
        // JOIN
        // ==================================================

        if (command === "join") {

            const channel =
                interaction.member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "🎧 Entra primero a un canal de voz."
                        )
                    ]
                });
            }

            try {

                await connect(
                    channel,
                    id
                );

                server.textChannel =
                    interaction.channel;

                return interaction.reply({
                    embeds: [
                        ok(
                            "🎧 Conectado",
                            `Entré a **${channel.name}**.`
                        )
                    ]
                });

            } catch (err) {

                console.error(
                    "❌ /join:",
                    err
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

        // ==================================================
        // PLAY
        // ==================================================

        if (command === "play") {

            const channel =
                interaction.member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "🎧 Debes estar en un canal de voz."
                        )
                    ]
                });
            }

            await interaction.deferReply();

            server.textChannel =
                interaction.channel;

            try {

                if (!server.connection) {

                    await connect(
                        channel,
                        id
                    );
                }

                const query =
                    interaction.options.getString(
                        "cancion"
                    );

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

                if (server.current) {

                    server.queue.push(
                        song
                    );

                    return interaction.editReply({
                        embeds: [
                            ok(
                                "📋 Añadida a la cola",
                                `🎵 **${song.title}**\n` +
                                `📍 Posición: **${server.queue.length}**`
                            )
                        ]
                    });
                }

                server.current =
                    song;

                const success =
                    await playSong(
                        id,
                        song
                    );

                if (!success) {

                    server.current = null;

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
                        ok(
                            "🎶 Reproduciendo",
                            `**${song.title}**`
                        )
                    ]
                });

            } catch (err) {

                console.error(
                    "❌ ERROR /PLAY:"
                );

                console.error(
                    err
                );

                server.current = null;

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "❌ Ocurrió un error al reproducir la canción."
                        )
                    ]
                });
            }
        }

        // ==================================================
        // PAUSE
        // ==================================================

        if (command === "pause") {

            if (!server.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay música reproduciéndose."
                        )
                    ]
                });
            }

            server.player.pause();

            return interaction.reply({
                embeds: [
                    ok(
                        "⏸️ Pausado",
                        `**${server.current.title}**`
                    )
                ]
            });
        }

        // ==================================================
        // RESUME
        // ==================================================

        if (command === "resume") {

            if (!server.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay música."
                        )
                    ]
                });
            }

            server.player.unpause();

            return interaction.reply({
                embeds: [
                    ok(
                        "▶️ Reanudado",
                        `**${server.current.title}**`
                    )
                ]
            });
        }

        // ==================================================
        // SKIP
        // ==================================================

        if (command === "skip") {

            if (!server.current) {

                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "No hay ninguna canción."
                        )
                    ]
                });
            }

            server.player.stop();

            return interaction.reply({
                embeds: [
                    ok(
                        "⏭️ Saltando",
                        "Reproduciendo la siguiente canción."
                    )
                ]
            });
        }

        // ==================================================
        // STOP
        // ==================================================

        if (command === "stop") {

            disconnect(
                id,
                true
            );

            return interaction.reply({
                embeds: [
                    ok(
                        "🛑 Detenido",
                        "Música detenida, cola limpiada y NR MUSIC desconectado."
                    )
                ]
            });
        }

        // ==================================================
        // DISCONNECT
        // ==================================================

        if (command === "disconnect") {

            disconnect(
                id,
                false
            );

            return interaction.reply({
                embeds: [
                    ok(
                        "🚪 Desconectado",
                        "NR MUSIC salió del canal de voz."
                    )
                ]
            });
        }

        // ==================================================
        // QUEUE
        // ==================================================

        if (command === "queue") {

            let text = "";

            if (server.current) {

                text +=
                    `🎶 **Ahora:** ${server.current.title}\n\n`;
            }

            if (!server.queue.length) {

                text +=
                    "📋 No hay canciones en la cola.";

            } else {

                server.queue
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
                    ok(
                        "📋 Cola",
                        text
                    )
                ]
            });
        }

        // ==================================================
        // NOW PLAYING
        // ==================================================

        if (command === "nowplaying") {

            if (!server.current) {

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
                    ok(
                        "🎶 Reproduciendo",
                        `**${server.current.title}**\n\n` +
                        `🔊 Volumen: **${Math.round(server.volume * 100)}%**\n` +
                        `🔁 Loop: **${server.loop ? "Activado" : "Desactivado"}**`
                    )
                ]
            });
        }

        // ==================================================
        // VOLUME
        // ==================================================

        if (command === "volume") {

            const level =
                interaction.options.getInteger(
                    "nivel"
                );

            server.volume =
                level / 100;

            return interaction.reply({
                embeds: [
                    ok(
                        "🔊 Volumen",
                        `Volumen establecido en **${level}%**.`
                    )
                ]
            });
        }

        // ==================================================
        // LOOP
        // ==================================================

        if (command === "loop") {

            server.loop =
                !server.loop;

            return interaction.reply({
                embeds: [
                    ok(
                        server.loop
                            ? "🔁 Loop activado"
                            : "➡️ Loop desactivado",
                        server.loop
                            ? "La canción actual se repetirá."
                            : "La reproducción continuará normalmente."
                    )
                ]
            });
        }

        // ==================================================
        // SHUFFLE
        // ==================================================

        if (command === "shuffle") {

            for (
                let i = server.queue.length - 1;
                i > 0;
                i--
            ) {

                const j =
                    Math.floor(
                        Math.random() * (i + 1)
                    );

                [
                    server.queue[i],
                    server.queue[j]
                ] = [
                    server.queue[j],
                    server.queue[i]
                ];
            }

            return interaction.reply({
                embeds: [
                    ok(
                        "🔀 Cola mezclada",
                        "La cola fue mezclada."
                    )
                ]
            });
        }

        // ==================================================
        // REMOVE
        // ==================================================

        if (command === "remove") {

            const position =
                interaction.options.getInteger(
                    "posicion"
                );

            if (
                position < 1 ||
                position > server.queue.length
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
                server.queue.splice(
                    position - 1,
                    1
                )[0];

            return interaction.reply({
                embeds: [
                    ok(
                        "🗑️ Eliminada",
                        `Eliminé **${removed.title}** de la cola.`
                    )
                ]
            });
        }

        // ==================================================
        // CLEAR
        // ==================================================

        if (command === "clear") {

            const amount =
                server.queue.length;

            server.queue = [];

            return interaction.reply({
                embeds: [
                    ok(
                        "🧹 Cola limpiada",
                        `Se eliminaron **${amount}** canciones.`
                    )
                ]
            });
        }
    }
);

// ======================================================
// READY
// ======================================================

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

// ======================================================
// ERRORES
// ======================================================

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

// ======================================================
// LOGIN
// ======================================================

client.login(
    TOKEN
);
