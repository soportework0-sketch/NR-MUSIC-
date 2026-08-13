// ============================================================
// 🎵 NR MUSIC
// Discord Music Bot
// ============================================================

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

// Si quieres registrar los comandos solamente en un servidor,
// pon el ID aquí. Si lo dejas vacío, se registran globalmente.
const GUILD_ID = process.env.GUILD_ID || "";

// Tiempo que puede estar solo antes de desconectarse.
// 5 minutos.
const EMPTY_CHANNEL_TIMEOUT = 5 * 60 * 1000;

// ============================================================
// CLIENT
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
// SERVERS / QUEUES
// ============================================================

const music = new Map();

/*
music.get(guildId) = {
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
// HELPERS
// ============================================================

function getGuildMusic(guildId) {
    if (!music.has(guildId)) {
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
            emptyTimer: null,
            textChannel: null
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            await playNext(guildId);
        });

        player.on("error", async error => {
            console.error(`[NR MUSIC] Audio error:`, error);

            const guildMusic = music.get(guildId);

            if (!guildMusic) return;

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
        });

        music.set(guildId, data);
    }

    return music.get(guildId);
}

// ============================================================
// EMBEDS
// ============================================================

function createEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        })
        .setTimestamp();
}

function createErrorEmbed(description) {
    return new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ NR MUSIC")
        .setDescription(description)
        .setFooter({
            text: "🎵 NR MUSIC"
        });
}

// ============================================================
// CHECK VC
// ============================================================

function getUserVoiceChannel(interaction) {
    return interaction.member?.voice?.channel || null;
}

function isBotInVoice(interaction) {
    const guildMusic = music.get(interaction.guild.id);

    return !!(
        guildMusic &&
        guildMusic.connection
    );
}

// ============================================================
// JOIN VOICE
// ============================================================

async function connectToVoice(channel, guildId) {
    const guildMusic = getGuildMusic(guildId);

    if (guildMusic.emptyTimer) {
        clearTimeout(guildMusic.emptyTimer);
        guildMusic.emptyTimer = null;
    }

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
    });

    guildMusic.connection = connection;

    connection.subscribe(guildMusic.player);

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
                disconnectGuild(guildId);
            }
        }
    );

    return connection;
}

// ============================================================
// DISCONNECT
// ============================================================

function disconnectGuild(guildId, clearQueue = true) {
    const guildMusic = music.get(guildId);

    if (!guildMusic) return;

    if (guildMusic.emptyTimer) {
        clearTimeout(guildMusic.emptyTimer);
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
// SEARCH MUSIC
// ============================================================

async function searchSong(query) {
    try {
        // URL directa
        if (play.yt_validate(query) === "video") {
            const info = await play.video_basic_info(query);

            return {
                title: info.video_details.title,
                url: info.video_details.url,
                duration: info.video_details.durationRaw,
                thumbnail: info.video_details.thumbnails?.[0]?.url || null
            };
        }

        // Búsqueda
        const results = await play.search(query, {
            limit: 1,
            source: {
                youtube: "video"
            }
        });

        if (!results.length) {
            return null;
        }

        const video = results[0];

        return {
            title: video.title,
            url: video.url,
            duration: video.durationRaw,
            thumbnail: video.thumbnails?.[0]?.url || null
        };

    } catch (error) {
        console.error("[SEARCH ERROR]", error);
        return null;
    }
}

// ============================================================
// PLAY AUDIO
// ============================================================

async function playSong(song, guildId) {
    const guildMusic = getGuildMusic(guildId);

    try {
        const stream = await play.stream(song.url, {
            quality: 2,
            discordPlayerCompatibility: true
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        resource.volume?.setVolume(
            Math.max(0, Math.min(100, guildMusic.volume)) / 100
        );

        guildMusic.player.play(resource);

        return true;

    } catch (error) {
        console.error("[PLAY ERROR]", error);
        return false;
    }
}

// ============================================================
// NEXT SONG
// ============================================================

async function playNext(guildId) {
    const guildMusic = music.get(guildId);

    if (!guildMusic) return;

    // LOOP
    if (
        guildMusic.loop &&
        guildMusic.current
    ) {
        const success = await playSong(
            guildMusic.current,
            guildId
        );

        if (!success) {
            guildMusic.loop = false;
            await playNext(guildId);
        }

        return;
    }

    // No hay más canciones
    if (!guildMusic.queue.length) {
        guildMusic.current = null;

        if (guildMusic.textChannel) {
            guildMusic.textChannel.send({
                embeds: [
                    createEmbed(
                        "🎵 Cola finalizada",
                        "No quedan más canciones en la cola."
                    )
                ]
            }).catch(() => {});
        }

        return;
    }

    const next = guildMusic.queue.shift();

    guildMusic.current = next;

    const success = await playSong(
        next,
        guildId
    );

    if (!success) {
        guildMusic.current = null;

        if (guildMusic.textChannel) {
            guildMusic.textChannel.send({
                embeds: [
                    createErrorEmbed(
                        `No pude reproducir **${next.title}**.`
                    )
                ]
            }).catch(() => {});
        }

        await playNext(guildId);
        return;
    }

    if (guildMusic.textChannel) {
        const embed = createEmbed(
            "🎶 Reproduciendo ahora",
            `**${next.title}**`
        );

        if (next.thumbnail) {
            embed.setThumbnail(next.thumbnail);
        }

        guildMusic.textChannel.send({
            embeds: [embed]
        }).catch(() => {});
    }
}

// ============================================================
// EMPTY VC AUTO DISCONNECT
// ============================================================

function checkEmptyVoice(guild) {
    const guildMusic = music.get(guild.id);

    if (!guildMusic || !guildMusic.connection) {
        return;
    }

    const me = guild.members.me;

    if (!me || !me.voice.channel) {
        return;
    }

    const channel = me.voice.channel;

    const humans = channel.members.filter(
        member => !member.user.bot
    );

    if (humans.size === 0) {
        if (guildMusic.emptyTimer) return;

        guildMusic.emptyTimer = setTimeout(() => {
            const current = music.get(guild.id);

            if (!current || !current.connection) {
                return;
            }

            const botChannel = guild.members.me?.voice?.channel;

            if (!botChannel) {
                disconnectGuild(guild.id, true);
                return;
            }

            const users = botChannel.members.filter(
                member => !member.user.bot
            );

            if (users.size === 0) {
                disconnectGuild(guild.id, true);
            }

        }, EMPTY_CHANNEL_TIMEOUT);
    } else {
        if (guildMusic.emptyTimer) {
            clearTimeout(guildMusic.emptyTimer);
            guildMusic.emptyTimer = null;
        }
    }
}

// ============================================================
// VOICE STATE UPDATE
// ============================================================

client.on("voiceStateUpdate", (oldState, newState) => {
    const guild = newState.guild || oldState.guild;

    checkEmptyVoice(guild);
});

// ============================================================
// COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("join")
        .setDescription("🎧 Entra al canal de voz donde estás."),

    new SlashCommandBuilder()
        .setName("play")
        .setDescription("🎵 Reproduce una canción.")
        .addStringOption(option =>
            option
                .setName("cancion")
                .setDescription("Nombre o URL de la canción.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription("⏸️ Pausa la reproducción."),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription("▶️ Reanuda la reproducción."),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("⏭️ Salta la canción actual."),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription("🛑 Detiene todo y saca al bot del VC."),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription("📋 Muestra la cola."),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("🎶 Muestra la canción actual."),

    new SlashCommandBuilder()
        .setName("volume")
        .setDescription("🔊 Cambia el volumen.")
        .addIntegerOption(option =>
            option
                .setName("nivel")
                .setDescription("Volumen entre 1 y 100.")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("loop")
        .setDescription("🔁 Activa o desactiva la repetición."),

    new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("🔀 Mezcla la cola."),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("🗑️ Elimina una canción de la cola.")
        .addIntegerOption(option =>
            option
                .setName("posicion")
                .setDescription("Posición de la canción.")
                .setMinValue(1)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("🧹 Limpia la cola."),

    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("🚪 Saca al bot del canal de voz."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("📚 Muestra los comandos de NR MUSIC.")

].map(command => command.toJSON());

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {
    const rest = new REST({
        version: "10"
    }).setToken(TOKEN);

    try {
        console.log("[NR MUSIC] Registrando comandos...");

        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                "[NR MUSIC] Comandos registrados en el servidor."
            );
        } else {
            await rest.put(
                Routes.applicationCommands(
                    CLIENT_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                "[NR MUSIC] Comandos globales registrados."
            );
        }

    } catch (error) {
        console.error(
            "[NR MUSIC] Error registrando comandos:",
            error
        );
    }
}

// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command = interaction.commandName;
    const guild = interaction.guild;

    if (!guild) {
        return interaction.reply({
            embeds: [
                createErrorEmbed(
                    "Este comando solamente puede utilizarse dentro de un servidor."
                )
            ],
            ephemeral: true
        });
    }

    const guildId = guild.id;

    // ========================================================
    // /JOIN
    // ========================================================

    if (command === "join") {

        const voiceChannel = getUserVoiceChannel(interaction);

        if (!voiceChannel) {
            return interaction.reply({
                embeds: [
                    createErrorEmbed(
                        "Debes estar conectado a un canal de voz."
                    )
                ],
                ephemeral: true
            });
        }

        const guildMusic = getGuildMusic(guildId);

        try {

            if (
                guildMusic.connection &&
                guild.members.me?.voice?.channelId === voiceChannel.id
            ) {
                return interaction.reply({
                    embeds: [
                        createEmbed(
                            "🎧 Ya estoy conectado",
                            `Ya estoy en **${voiceChannel.name}**.`
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
            console.error(error);

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

    // ========================================================
    // /PLAY
    // ========================================================

    if (command === "play") {

        const voiceChannel = getUserVoiceChannel(interaction);

        if (!voiceChannel) {
            return interaction.reply({
                embeds: [
                    createErrorEmbed(
                        "Debes estar en un canal de voz para utilizar este comando."
                    )
                ],
                ephemeral: true
            });
        }

        const guildMusic = getGuildMusic(guildId);

        await interaction.deferReply();

        try {

            // Conectar automáticamente si no está conectado
            if (!guildMusic.connection) {
                await connectToVoice(
                    voiceChannel,
                    guildId
                );
            }

            // Si está en otro canal
            else if (
                guild.members.me?.voice?.channelId !== voiceChannel.id
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
                interaction.options.getString("cancion");

            const song = await searchSong(query);

            if (!song) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            "No encontré esa canción."
                        )
                    ]
                });
            }

            const wasPlaying =
                guildMusic.current ||
                guildMusic.player.state.status ===
                AudioPlayerStatus.Playing;

            if (wasPlaying) {

                guildMusic.queue.push(song);

                return interaction.editReply({
                    embeds: [
                        createEmbed(
                            "📋 Añadida a la cola",
                            `**${song.title}**\n\nPosición: **${guildMusic.queue.length}**`
                        )
                    ]
                });

            }

            guildMusic.current = song;

            const success = await playSong(
                song,
                guildId
            );

            if (!success) {
                guildMusic.current = null;

                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            "No pude reproducir esa canción."
                        )
                    ]
                });
            }

            const embed = createEmbed(
                "🎶 Reproduciendo",
                `**${song.title}**`
            );

            if (song.thumbnail) {
                embed.setThumbnail(song.thumbnail);
            }

            return interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error(error);

            return interaction.editReply({
                embeds: [
                    createErrorEmbed(
                        "Ocurrió un error intentando reproducir la canción."
                    )
                ]
            });
        }
    }

    // ========================================================
    // /PAUSE
    // ========================================================

    if (command === "pause") {

        const guildMusic = music.get(guildId);

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

        if (
            guildMusic.player.state.status ===
            AudioPlayerStatus.Paused
        ) {
            return interaction.reply({
                embeds: [
                    createErrorEmbed(
                        "La reproducción ya está pausada."
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

    // ========================================================
    // /RESUME
    // ========================================================

    if (command === "resume") {

        const guildMusic = music.get(guildId);

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

    // ========================================================
    // /SKIP
    // ========================================================

    if (command === "skip") {

        const guildMusic = music.get(guildId);

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

        guildMusic.loop = false;

        guildMusic.player.stop();

        return interaction.reply({
            embeds: [
                createEmbed(
                    "⏭️ Canción saltada",
                    "Pasando a la siguiente canción..."
                )
            ]
        });
    }

    // ========================================================
    // /STOP
    // ========================================================

    if (command === "stop") {

        const guildMusic = music.get(guildId);

        if (
            !guildMusic ||
            !guildMusic.connection
        ) {
            return interaction.reply({
                embeds: [
                    createErrorEmbed(
                        "NR MUSIC no está conectado a un canal de voz."
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
                    "La reproducción se detuvo, la cola fue eliminada y NR MUSIC abandonó el canal de voz."
                )
            ]
        });
    }

    // ========================================================
    // /QUEUE
    // ========================================================

    if (command === "queue") {

        const guildMusic = music.get(guildId);

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

        if (guildMusic.current) {
            description +=
                `🎶 **Reproduciendo:** ${guildMusic.current.title}\n\n`;
        }

        if (guildMusic.queue.length) {

            description += "**Siguiente:**\n";

            guildMusic.queue
                .slice(0, 15)
                .forEach((song, index) => {
                    description +=
                        `\`${index + 1}.\` ${song.title}\n`;
                });

            if (guildMusic.queue.length > 15) {
                description +=
                    `\n... y ${guildMusic.queue.length - 15} más.`;
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

    // ========================================================
    // /NOWPLAYING
    // ========================================================

    if (command === "nowplaying") {

        const guildMusic = music.get(guildId);

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

        const embed = createEmbed(
            "🎶 Sonando ahora",
            `**${guildMusic.current.title}**\n\nVolumen: **${guildMusic.volume}%**\nRepetición: **${guildMusic.loop ? "Activada 🔁" : "Desactivada"}**`
        );

        if (guildMusic.current.thumbnail) {
            embed.setThumbnail(
                guildMusic.current.thumbnail
            );
        }

        return interaction.reply({
            embeds: [embed]
        });
    }

    // ========================================================
    // /VOLUME
    // ========================================================

    if (command === "volume") {

        const level =
            interaction.options.getInteger("nivel");

        const guildMusic = getGuildMusic(guildId);

        guildMusic.volume = level;

        return interaction.reply({
            embeds: [
                createEmbed(
                    "🔊 Volumen actualizado",
                    `El volumen de NR MUSIC ahora está en **${level}%**.`
                )
            ]
        });
    }

    // ========================================================
    // /LOOP
    // ========================================================

    if (command === "loop") {

        const guildMusic = getGuildMusic(guildId);

        guildMusic.loop = !guildMusic.loop;

        return interaction.reply({
            embeds: [
                createEmbed(
                    guildMusic.loop
                        ? "🔁 Repetición activada"
                        : "➡️ Repetición desactivada",
                    guildMusic.loop
                        ? "La canción actual se repetirá."
                        : "La canción actual ya no se repetirá."
                )
            ]
        });
    }

    // ========================================================
    // /SHUFFLE
    // ========================================================

    if (command === "shuffle") {

        const guildMusic = music.get(guildId);

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
            let i = guildMusic.queue.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(Math.random() * (i + 1));

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
                    "El orden de las canciones fue mezclado correctamente."
                )
            ]
        });
    }

    // ========================================================
    // /REMOVE
    // ========================================================

    if (command === "remove") {

        const position =
            interaction.options.getInteger("posicion");

        const guildMusic = music.get(guildId);

        if (
            !guildMusic ||
            !guildMusic.queue.length
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
            position > guildMusic.queue.length
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

    // ========================================================
    // /CLEAR
    // ========================================================

    if (command === "clear") {

        const guildMusic = music.get(guildId);

        if (
            !guildMusic ||
            !guildMusic.queue.length
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

        guildMusic.queue = [];

        return interaction.reply({
            embeds: [
                createEmbed(
                    "🧹 Cola limpiada",
                    `Se eliminaron **${amount} canciones** de la cola.`
                )
            ]
        });
    }

    // ========================================================
    // /DISCONNECT
    // ========================================================

    if (command === "disconnect") {

        const guildMusic = music.get(guildId);

        if (
            !guildMusic ||
            !guildMusic.connection
        ) {
            return interaction.reply({
                embeds: [
                    createErrorEmbed(
                        "NR MUSIC no está conectado a un canal de voz."
                    )
                ],
                ephemeral: true
            });
        }

        /*
         * Disconnect:
         * - Para reproducción
         * - Desconecta del VC
         * - Conserva la cola
         */

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

        return interaction.reply({
            embeds: [
                createEmbed(
                    "🚪 Desconectado",
                    "NR MUSIC abandonó el canal de voz."
                )
            ]
        });
    }

    // ========================================================
    // /HELP
    // ========================================================

    if (command === "help") {

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎵 NR MUSIC")
            .setDescription(
                "Sistema de música de NR MUSIC.\n\nUtiliza los siguientes comandos:"
            )
            .addFields(
                {
                    name: "🎧 Conexión",
                    value:
                        "`/join` — Entra al canal de voz.\n" +
                        "`/disconnect` — Sale del canal de voz.\n" +
                        "`/stop` — Detiene todo y sale."
                },
                {
                    name: "🎵 Música",
                    value:
                        "`/play <canción>` — Reproduce una canción.\n" +
                        "`/pause` — Pausa.\n" +
                        "`/resume` — Reanuda.\n" +
                        "`/skip` — Siguiente canción."
                },
                {
                    name: "📋 Cola",
                    value:
                        "`/queue` — Ver cola.\n" +
                        "`/nowplaying` — Canción actual.\n" +
                        "`/remove <posición>` — Eliminar canción.\n" +
                        "`/clear` — Limpiar cola.\n" +
                        "`/shuffle` — Mezclar cola."
                },
                {
                    name: "⚙️ Control",
                    value:
                        "`/volume <1-100>` — Cambiar volumen.\n" +
                        "`/loop` — Activar/desactivar repetición."
                }
            )
            .setFooter({
                text: "🎵 NR MUSIC • +10 bots en funcionamiento"
            })
            .setTimestamp();

        return interaction.reply({
            embeds: [embed]
        });
    }

});

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {

    console.log("======================================");
    console.log("🎵 NR MUSIC");
    console.log("======================================");
    console.log(`🤖 Bot: ${client.user.tag}`);
    console.log(`🆔 ID: ${client.user.id}`);
    console.log(`🌐 Servidores: ${client.guilds.cache.size}`);
    console.log("🔴 Estado: DND");
    console.log("🎵 Actividad: +10 bots en funcionamiento | /help");
    console.log("======================================");

    // Presencia permanente DND
    client.user.setPresence({
        status: "dnd",
        activities: [
            {
                name: "+10 bots en funcionamiento | /help",
                type: ActivityType.Custom
            }
        ]
    });

    await registerCommands();
});

// ============================================================
// LOGIN
// ============================================================

if (!TOKEN) {
    console.error(
        "❌ Falta la variable de entorno TOKEN."
    );
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error(
        "❌ Falta la variable de entorno CLIENT_ID."
    );
    process.exit(1);
}

client.login(TOKEN);
