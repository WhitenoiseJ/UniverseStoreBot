require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// =========================
// CONFIGURAÇÃO
// =========================
// Depois de criar os cargos/categorias no Discord, coloque os IDs no .env.
// STAFF_ROLE_ID = cargo que poderá ver/atender todos os tickets.
// TICKET_CATEGORY_ID = categoria onde os tickets serão criados.
// CLOSED_TICKET_CATEGORY_ID = opcional; categoria onde tickets fechados serão arquivados.

const ticketTypes = {
  pad: {
    label: 'Comprar PAD',
    emoji: '🎭',
    description: 'Orçamento e compra de PADs para GTA.',
    prefix: 'pad',
    title: '🎭 Ticket — Comprar PAD',
    message:
      'Envie as referências e explique como você quer o PAD. Se possível, informe detalhes como masculino/feminino, roupas, cabelo e outras alterações.',
  },
  cenario: {
    label: 'Cenários',
    emoji: '🏙️',
    description: 'Orçamentos e dúvidas sobre cenários.',
    prefix: 'cenario',
    title: '🏙️ Ticket — Cenários',
    message:
      'Explique qual cenário você deseja e envie referências, imagens ou detalhes do projeto.',
  },
  suporte: {
    label: 'Suporte',
    emoji: '🛠️',
    description: 'Problemas, instalação ou dúvidas.',
    prefix: 'suporte',
    title: '🛠️ Ticket — Suporte',
    message:
      'Descreva o problema com o máximo de detalhes possível. Se houver erro, envie prints ou mensagens de erro.',
  },
  parceria: {
    label: 'Parcerias',
    emoji: '🤝',
    description: 'Propostas de parceria.',
    prefix: 'parceria',
    title: '🤝 Ticket — Parcerias',
    message:
      'Apresente sua proposta de parceria e informe seu projeto/servidor e como gostaria de trabalhar conosco.',
  },
};

function safeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'usuario';
}

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 Central de Atendimento')
    .setDescription(
      [
        'Olá! Seja bem-vindo à nossa central de atendimento.',
        '',
        'Selecione abaixo o assunto que melhor corresponde ao seu atendimento.',
        '',
        '🎭 **Comprar PAD** — orçamento e encomenda de PADs.',
        '🏙️ **Cenários** — orçamento e encomenda de cenários.',
        '🛠️ **Suporte** — problemas, instalação e dúvidas.',
        '🤝 **Parcerias** — propostas de parceria.',
        '',
        'Após selecionar uma opção, um canal privado será criado para você.',
      ].join('\n')
    )
    .setFooter({ text: 'Escolha uma opção no menu abaixo.' });
}

function panelComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_select')
    .setPlaceholder('Selecione o assunto do ticket')
    .addOptions(
      Object.entries(ticketTypes).map(([value, type]) => ({
        label: type.label,
        value,
        description: type.description,
        emoji: type.emoji,
      }))
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

async function fetchInteractionGuild(interaction) {
  if (interaction.guild) return interaction.guild;

  const channel = interaction.channelId
    ? await interaction.client.channels.fetch(interaction.channelId).catch(() => null)
    : null;

  if (channel?.guild) return channel.guild;
  if (!interaction.guildId) return null;

  return interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
}

async function getClosedTicketsCategory(guild, staffRoleId) {
  const closedCategoryId = process.env.CLOSED_TICKET_CATEGORY_ID;

  if (closedCategoryId) {
    const configuredCategory = await guild.channels.fetch(closedCategoryId).catch(() => null);
    if (configuredCategory?.type === ChannelType.GuildCategory) return configuredCategory;
  }

  const guildChannels = await guild.channels.fetch();
  const existingCategory = guildChannels.find(
    (channel) =>
      channel?.type === ChannelType.GuildCategory &&
      channel.name.toLowerCase() === 'tickets fechados'
  );

  if (existingCategory) return existingCategory;

  return guild.channels.create({
    name: 'Tickets Fechados',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: staffRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ManageMessages,
        ],
      },
    ],
  });
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot conectado como ${readyClient.user.tag}`);
  console.log('Use /painel no canal em que deseja publicar o menu de tickets.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // /painel
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Apenas administradores podem publicar o painel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.inGuild() || !interaction.channelId) {
        return interaction.reply({
          content: '❌ Use este comando em um canal do servidor.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const panelChannel =
        interaction.channel ??
        (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));

      if (!panelChannel?.isTextBased() || !panelChannel.isSendable()) {
        return interaction.reply({
          content:
            '❌ Não consegui enviar mensagens neste canal. Verifique se o bot tem permissão de Enviar Mensagens nele.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const panelMessage = await panelChannel.send({
        embeds: [panelEmbed()],
        components: panelComponents(),
      });

      return interaction.reply({
        content: `✅ Painel fixo publicado: ${panelMessage.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Seleção do tipo de ticket
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const typeKey = interaction.values[0];
      const type = ticketTypes[typeKey];
      if (!type) return interaction.editReply('❌ Tipo de ticket inválido.');

      const guild = await fetchInteractionGuild(interaction);
      const staffRoleId = process.env.STAFF_ROLE_ID;
      const categoryId = process.env.TICKET_CATEGORY_ID;

      if (!guild) {
        return interaction.editReply(
          '❌ Não consigo acessar este servidor como bot. Reconvide o bot para o servidor com os escopos `bot` e `applications.commands`, e dê permissão para criar canais.'
        );
      }

      if (!staffRoleId || staffRoleId === 'COLOQUE_O_ID_DO_CARGO_DA_EQUIPE') {
        return interaction.editReply(
          '❌ O STAFF_ROLE_ID ainda não foi configurado no arquivo .env.'
        );
      }

      // Impede que o usuário abra mais de um ticket do mesmo tipo.
      const guildChannels = await guild.channels.fetch().catch(() => null);
      if (!guildChannels) {
        return interaction.editReply(
          '❌ Não consegui listar os canais do servidor. Verifique se o bot está no servidor e tem permissão para ver canais.'
        );
      }

      const existing = guildChannels.find(
        (channel) =>
          channel?.type === ChannelType.GuildText &&
          channel.topic === `ticket:${interaction.user.id}:${typeKey}`
      );

      if (existing) {
        return interaction.editReply(
          `⚠️ Você já possui um ticket desse tipo aberto: ${existing}`
        );
      }

      const channelName = `${type.prefix}-${safeName(interaction.user.username)}`;

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
          ],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ];

      const channel = await guild.channels
        .create({
          name: channelName,
          type: ChannelType.GuildText,
          parent:
            categoryId && categoryId !== 'COLOQUE_O_ID_DA_CATEGORIA_DE_TICKETS'
              ? categoryId
              : undefined,
          topic: `ticket:${interaction.user.id}:${typeKey}`,
          permissionOverwrites,
        })
        .catch((error) => {
          console.error('Erro ao criar canal de ticket:', error);
          return null;
        });

      if (!channel) {
        return interaction.editReply(
          '❌ Não consegui criar o canal do ticket. Verifique se o bot tem permissão de Gerenciar Canais e acesso à categoria configurada.'
        );
      }

      const closeButton = new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Arquivar Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(type.title)
        .setDescription(
          `Olá ${interaction.user}!\n\n${type.message}\n\nA equipe responderá assim que possível.`
        )
        .setFooter({ text: `Aberto por ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply(`✅ Seu ticket foi criado: ${channel}`);

      await channel
        .send({
          content: `${interaction.user} <@&${staffRoleId}>`,
          embeds: [embed],
          components: [row],
        })
        .catch((error) => {
          console.error('Erro ao enviar mensagem inicial do ticket:', error);
        });

      return;
    }

    // Fechar ticket
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const channel = interaction.channel;

      if (!channel?.topic?.startsWith('ticket:')) {
        return interaction.reply({
          content: '❌ Este canal não é um ticket.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const [, ownerId] = channel.topic.split(':');
      const isOwner = interaction.user.id === ownerId;
      const isStaff =
        interaction.member.roles?.cache?.has(process.env.STAFF_ROLE_ID) ||
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

      if (!isOwner && !isStaff) {
        return interaction.reply({
          content: '❌ Você não tem permissão para fechar este ticket.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirm = new ButtonBuilder()
        .setCustomId('ticket_delete_confirm')
        .setLabel('Confirmar arquivamento')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Danger);

      const cancel = new ButtonBuilder()
        .setCustomId('ticket_close_cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary);

      return interaction.reply({
        content: 'Tem certeza de que deseja fechar e arquivar este ticket?',
        components: [new ActionRowBuilder().addComponents(confirm, cancel)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_close_cancel') {
      return interaction.update({
        content: '✅ Fechamento cancelado.',
        components: [],
      });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete_confirm') {
      const channel = interaction.channel;
      const guild = await fetchInteractionGuild(interaction);
      const staffRoleId = process.env.STAFF_ROLE_ID;

      if (!channel?.topic?.startsWith('ticket:')) {
        return interaction.update({
          content: '❌ Este canal não é um ticket aberto.',
          components: [],
        });
      }

      if (!guild || !staffRoleId) {
        return interaction.update({
          content: '❌ Não consegui acessar o servidor ou o cargo da equipe para arquivar.',
          components: [],
        });
      }

      const [, ownerId, typeKey] = channel.topic.split(':');

      await interaction.update({
        content: '🔒 Ticket sendo arquivado...',
        components: [],
      });

      const closedCategory = await getClosedTicketsCategory(guild, staffRoleId);
      const archivedName = channel.name.startsWith('fechado-')
        ? channel.name
        : `fechado-${channel.name}`.slice(0, 100);

      await channel.setParent(closedCategory.id, { lockPermissions: false });
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: ownerId,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ]);
      await channel.setName(archivedName);
      await channel.setTopic(`closed-ticket:${ownerId}:${typeKey || 'geral'}`);
      await channel.send(`📦 Ticket arquivado por ${interaction.user}.`);
    }
  } catch (error) {
    console.error(error);

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply('❌ Ocorreu um erro ao executar essa ação.')
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: '❌ Ocorreu um erro ao executar essa ação.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  }
});

// Registra o comando /painel no servidor informado no .env.
// Comando por servidor aparece praticamente na hora.
async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    console.error(
      'Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env antes de iniciar.'
    );
    process.exit(1);
  }

  const { REST, Routes, SlashCommandBuilder } = require('discord.js');

  const commands = [
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Publica o painel para abertura de tickets.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });

  console.log('Comando /painel registrado.');
}

(async () => {
  try {
    await registerCommands();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('Erro ao iniciar o bot:', error);
  }
})();
