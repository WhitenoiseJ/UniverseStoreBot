require('dotenv').config();

const fs = require('fs');
const path = require('path');

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
// DISCORD_TOKEN deve ficar no .env/Square Cloud por segurança.
// As opções do painel são configuradas direto no comando /painel.
// As demais variáveis são opcionais e servem como fallback para painéis/tickets antigos.

const CONFIG_FILE = path.join(__dirname, 'bot-config.json');

const ticketTypes = {
  ped: {
    label: 'Peds',
    emoji: '🎭',
    description: 'Orçamento e encomenda de PEDs.',
    prefix: 'ped',
    title: '🎭 Ticket — Comprar PED',
    message:
      'Envie as referências e explique como você quer o PED. Se possível, informe detalhes como masculino/feminino, roupas, cabelo e outras alterações.',
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

const legacyTicketTypeKeys = {
  pad: 'ped',
};

function loadBotConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { guilds: {} };
  }
}

function saveBotConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getGuildConfig(guildId) {
  const config = loadBotConfig();
  return config.guilds[guildId] || {};
}

function updateGuildConfig(guildId, partialConfig) {
  const config = loadBotConfig();
  config.guilds[guildId] = {
    ...(config.guilds[guildId] || {}),
    ...partialConfig,
  };
  saveBotConfig(config);
  return config.guilds[guildId];
}

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

function generateTicketId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `${prefix.toUpperCase()}-${timestamp}${random}`;
}

function resolveTicketTypeKey(typeKey) {
  return legacyTicketTypeKeys[typeKey] ?? typeKey;
}

function equivalentTicketTypeKeys(typeKey) {
  const legacyKeys = Object.entries(legacyTicketTypeKeys)
    .filter(([, currentKey]) => currentKey === typeKey)
    .map(([legacyKey]) => legacyKey);

  return [typeKey, ...legacyKeys];
}

const AUTO_CONFIG_VALUE = 'auto';

function encodeConfigValue(value) {
  return value || AUTO_CONFIG_VALUE;
}

function decodeConfigValue(value) {
  return value && value !== AUTO_CONFIG_VALUE ? value : null;
}

function buildTicketSelectCustomId({ staffRoleId, categoryId, closedCategoryId }) {
  return [
    'ticket_select',
    staffRoleId || '',
    encodeConfigValue(categoryId),
    encodeConfigValue(closedCategoryId),
  ].join(':');
}

function parseTicketSelectCustomId(customId) {
  const [, staffRoleId, categoryId, closedCategoryId] = customId.split(':');

  return {
    staffRoleId: staffRoleId || process.env.STAFF_ROLE_ID,
    categoryId: decodeConfigValue(categoryId) || process.env.TICKET_CATEGORY_ID,
    closedCategoryId: decodeConfigValue(closedCategoryId) || process.env.CLOSED_TICKET_CATEGORY_ID,
  };
}

function parseTicketTopic(topic, expectedKind) {
  const [kind, ownerId, typeKey, ticketId, staffRoleId, categoryId, closedCategoryId] =
    (topic || '').split(':');

  if (expectedKind && kind !== expectedKind) return null;

  return {
    kind,
    ownerId,
    typeKey,
    ticketId,
    staffRoleId: decodeConfigValue(staffRoleId) || process.env.STAFF_ROLE_ID,
    categoryId: decodeConfigValue(categoryId) || process.env.TICKET_CATEGORY_ID,
    closedCategoryId: decodeConfigValue(closedCategoryId) || process.env.CLOSED_TICKET_CATEGORY_ID,
  };
}

function panelEmbed(imageUrl = process.env.PANEL_IMAGE_URL) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 Central de Atendimento')
    .setDescription(
      [
        'Olá! Seja bem-vindo à nossa central de atendimento.',
        '',
        'Selecione abaixo o assunto que melhor corresponde ao seu atendimento.',
        '',
        '🎭 **Peds** — orçamento e encomenda de PEDs.',
        '🏙️ **Cenários** — orçamento e encomenda de cenários.',
        '🛠️ **Suporte** — problemas, instalação e dúvidas.',
        '🤝 **Parcerias** — propostas de parceria.',
        '',
        'Após selecionar uma opção, um canal privado será criado para você.',
      ].join('\n')
    )
    .setFooter({ text: 'Escolha uma opção no menu abaixo.' });

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

function termsEmbed() {
  return new EmbedBuilder()
    .setColor(0x8A5CF6)
    .setDescription(
      [
        '<a:verificadoroxo:1392020027825324063> ・TERMOS — UNIVERSE STORE',
        '',
        '<a:heartroxo:1381656173358616677> Ao realizar uma compra, você declara estar ciente e de acordo com os termos abaixo.',
        '',
        '<a:cartao1:1489401747553255506> PAGAMENTO',
        '• A produção inicia somente após a confirmação do pagamento e envio do comprovante.',
        '• Confira os dados antes de pagar. Não nos responsabilizamos por pagamentos enviados incorretamente.',
        '• Alterações fora do pedido original poderão gerar custos adicionais.',
        '',
        '<a:estrelaroxa:1289596849400975400> PEDIDOS & ALTERAÇÕES',
        '• Envie todas as referências e informações necessárias antes do início da produção.',
        '• Alterações que mudem o pedido original poderão ser cobradas.',
        '• Erros causados pela Universe Store serão corrigidos sem custo.',
        '',
        '<a:seeven:1418738373232824471> PRAZO',
        '• O prazo será informado no ticket após a confirmação do pagamento.',
        '• O prazo começa após o pagamento e recebimento de todas as informações necessárias.',
        '• Imprevistos que alterem o prazo serão comunicados ao cliente.',
        '',
        '<a:1261hackerbongocat:998685236772741200> ENTREGA & ARQUIVOS',
        '• Após receber o produto, faça o download e mantenha um backup.',
        '• Não garantimos reenvio de arquivos perdidos pelo cliente.',
        '• Problemas causados por alterações do cliente/terceiros podem invalidar o suporte.',
        '',
        '<a:money:1489992851965087886> CANCELAMENTO & REEMBOLSO',
        '• Após o início da produção, o cancelamento poderá não gerar reembolso.',
        '• Problemas comprovadamente causados pela Universe Store serão analisados para correção ou substituição.',
        '',
        '<a:atencao:1014387424736059402>  SUPORTE',
        '• Todo atendimento deve ser feito pelo ticket do pedido.',
        '• Evite chamar a equipe no privado sobre compras.',
        '• Tickets são privados e destinados ao cliente responsável.',
        '',
        '<:block:1519108755604635738>  PROIBIÇÕES',
        '• É proibido revender, compartilhar, redistribuir ou disponibilizar os arquivos sem autorização.',
        '• Não é permitida a remoção de créditos ou utilização do trabalho como autoria própria.',
        '',
        '<a:Camera:1386757335317352499>  DIVULGAÇÃO',
        '• A Universe Store poderá utilizar imagens/vídeos dos trabalhos para divulgação, salvo acordo prévio.',
        '',
        '<a:raio1:1489400858666991718> CONDUTA',
        '• Respeito à equipe é obrigatório.',
        '• Fraudes, comprovantes falsos, chargebacks indevidos ou comportamento abusivo poderão resultar em bloqueio.',
        '',
        '<a:heartroxo:1381656173358616677>  Universe Store — Transformando sua ideia em realidade.',
        '<a:interrogacao:1489990526349480018> Dúvidas? Abra um ticket antes de realizar sua compra.',
      ].join('\n')
    );
}

function welcomeEmbed({ announcementsChannelId, imageUrl }) {
  const announcementsText = announcementsChannelId ? `<#${announcementsChannelId}>` : '#📢・avisos';
  const embed = new EmbedBuilder()
    .setColor(0x8A5CF6)
    .setTitle('|Bem-vindo(a)Universe Store')
    .setDescription(
      [
        'Aqui você encontrará variados peds, totalmente do jeitinho que você sempre sonhou. Caso tenha dúvidas pode nos contatar <3',
        '',
        `📢 **Não se esqueça de sempre ficar atento na ${announcementsText}**`,
      ].join('\n')
    )
    .setFooter({ text: 'Universe Store • © Todos os direitos reservados.' });

  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  return embed;
}

function panelComponents(config = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildTicketSelectCustomId(config))
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

async function getClosedTicketsCategory(guild, staffRoleId, closedCategoryId) {
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

client.on(Events.GuildMemberAdd, async (member) => {
  const welcomeConfig = getGuildConfig(member.guild.id).welcome;
  if (!welcomeConfig?.channelId) return;

  const welcomeChannel = await member.guild.channels
    .fetch(welcomeConfig.channelId)
    .catch(() => null);

  if (!welcomeChannel?.isTextBased() || !welcomeChannel.isSendable()) return;

  await welcomeChannel
    .send({
      content: `${member}`,
      embeds: [
        welcomeEmbed({
          announcementsChannelId: welcomeConfig.announcementsChannelId,
          imageUrl: welcomeConfig.imageUrl,
        }),
      ],
    })
    .catch((error) => {
      console.error('Erro ao enviar mensagem de boas-vindas:', error);
    });
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

      const staffRole = interaction.options.getRole('cargo_equipe', true);
      const ticketCategory = interaction.options.getChannel('categoria_tickets', true);
      const closedTicketCategory = interaction.options.getChannel('categoria_fechados');
      const panelImageUrl = interaction.options.getString('imagem') || process.env.PANEL_IMAGE_URL;

      const panelMessage = await panelChannel.send({
        embeds: [panelEmbed(panelImageUrl)],
        components: panelComponents({
          staffRoleId: staffRole.id,
          categoryId: ticketCategory.id,
          closedCategoryId: closedTicketCategory?.id,
        }),
      });

      return interaction.reply({
        content: [
          `✅ Painel fixo publicado: ${panelMessage.url}`,
          `Equipe: ${staffRole}`,
          `Categoria dos tickets: ${ticketCategory}`,
          closedTicketCategory ? `Categoria dos fechados: ${closedTicketCategory}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }

    // /terms
    if (interaction.isChatInputCommand() && interaction.commandName === 'terms') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Apenas administradores podem publicar os termos.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.inGuild() || !interaction.channelId) {
        return interaction.reply({
          content: '❌ Use este comando em um canal do servidor.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const termsChannel =
        interaction.channel ??
        (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));

      if (!termsChannel?.isTextBased() || !termsChannel.isSendable()) {
        return interaction.reply({
          content:
            '❌ Não consegui enviar mensagens neste canal. Verifique se o bot tem permissão de Enviar Mensagens nele.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const termsMessage = await termsChannel.send({
        embeds: [termsEmbed()],
      });

      return interaction.reply({
        content: `✅ Termos publicados: ${termsMessage.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // /boasvindas
    if (interaction.isChatInputCommand() && interaction.commandName === 'boasvindas') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Apenas administradores podem configurar as boas-vindas.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.inGuild()) {
        return interaction.reply({
          content: '❌ Use este comando em um servidor.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const welcomeChannel = interaction.options.getChannel('canal', true);
      const announcementsChannel = interaction.options.getChannel('canal_avisos', true);
      const imageUrl =
        interaction.options.getString('imagem') ||
        getGuildConfig(interaction.guildId).welcome?.imageUrl ||
        process.env.PANEL_IMAGE_URL ||
        null;

      updateGuildConfig(interaction.guildId, {
        welcome: {
          channelId: welcomeChannel.id,
          announcementsChannelId: announcementsChannel.id,
          imageUrl,
        },
      });

      return interaction.reply({
        content: [
          '✅ Boas-vindas configuradas.',
          `Canal: ${welcomeChannel}`,
          `Canal de avisos: ${announcementsChannel}`,
          imageUrl ? `Imagem: ${imageUrl}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }

    // Seleção do tipo de ticket
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const panelConfig = parseTicketSelectCustomId(interaction.customId);
      const typeKey = resolveTicketTypeKey(interaction.values[0]);
      const type = ticketTypes[typeKey];
      if (!type) return interaction.editReply('❌ Tipo de ticket inválido.');

      const guild = await fetchInteractionGuild(interaction);
      const staffRoleId = panelConfig.staffRoleId;
      const categoryId = panelConfig.categoryId;
      const closedCategoryId = panelConfig.closedCategoryId;

      if (!guild) {
        return interaction.editReply(
          '❌ Não consigo acessar este servidor como bot. Reconvide o bot para o servidor com os escopos `bot` e `applications.commands`, e dê permissão para criar canais.'
        );
      }

      if (!staffRoleId || staffRoleId === 'COLOQUE_O_ID_DO_CARGO_DA_EQUIPE') {
        return interaction.editReply(
          '❌ O cargo da equipe não foi configurado neste painel. Publique um novo painel usando `/painel` e escolha o cargo da equipe.'
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
        (channel) => {
          const topicPrefixes = equivalentTicketTypeKeys(typeKey).map(
            (equivalentTypeKey) => `ticket:${interaction.user.id}:${equivalentTypeKey}`
          );

          return (
            channel?.type === ChannelType.GuildText &&
            topicPrefixes.some(
              (topicPrefix) =>
                channel.topic === topicPrefix || channel.topic?.startsWith(`${topicPrefix}:`)
            )
          );
        }
      );

      if (existing) {
        return interaction.editReply(
          `⚠️ Você já possui um ticket desse tipo aberto: ${existing}`
        );
      }

      const ticketId = generateTicketId(type.prefix);
      const channelName = `${ticketId.toLowerCase()}-${safeName(
        interaction.user.username
      )}`.slice(0, 100);

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
          topic: `ticket:${interaction.user.id}:${typeKey}:${ticketId}:${staffRoleId}:${encodeConfigValue(
            categoryId
          )}:${encodeConfigValue(closedCategoryId)}`,
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
        .setLabel('Fechar Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(type.title)
        .setDescription(
          `Olá ${interaction.user}!\n\n**ID do Ticket:** \`${ticketId}\`\n\n${type.message}\n\nA equipe responderá assim que possível.`
        )
        .setFooter({ text: `Aberto por ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply(`✅ Seu ticket foi criado: ${channel}\nID: \`${ticketId}\``);

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

      const ticketInfo = parseTicketTopic(channel.topic, 'ticket');
      const ownerId = ticketInfo?.ownerId;
      const staffRoleId = ticketInfo?.staffRoleId;
      const isOwner = interaction.user.id === ownerId;
      const isStaff =
        (staffRoleId && interaction.member.roles?.cache?.has(staffRoleId)) ||
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

      if (!isOwner && !isStaff) {
        return interaction.reply({
          content: '❌ Você não tem permissão para fechar este ticket.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirm = new ButtonBuilder()
        .setCustomId('ticket_delete_confirm')
        .setLabel('Confirmar fechamento')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const cancel = new ButtonBuilder()
        .setCustomId('ticket_close_cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary);

      return interaction.reply({
        content: 'Tem certeza de que deseja fechar este ticket?',
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

      if (!channel?.topic?.startsWith('ticket:')) {
        return interaction.update({
          content: '❌ Este canal não é um ticket aberto.',
          components: [],
        });
      }

      const ticketInfo = parseTicketTopic(channel.topic, 'ticket');
      const { ownerId, typeKey, ticketId, staffRoleId, categoryId, closedCategoryId } =
        ticketInfo || {};

      if (!guild || !staffRoleId) {
        return interaction.update({
          content: '❌ Não consegui acessar o servidor ou o cargo da equipe para fechar.',
          components: [],
        });
      }

      await interaction.update({
        content: '🔒 Ticket sendo fechado...',
        components: [],
      });

      const closedCategory = await getClosedTicketsCategory(guild, staffRoleId, closedCategoryId);
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
      await channel.setTopic(
        `closed-ticket:${ownerId}:${typeKey || 'geral'}:${ticketId || 'sem-id'}:${staffRoleId}:${encodeConfigValue(
          categoryId
        )}:${encodeConfigValue(closedCategoryId)}`
      );

      const reopenButton = new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reabrir Ticket')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success);

      await channel.send({
        content: `🔒 Ticket fechado por ${interaction.user}.${
          ticketId ? `\nID do Ticket: \`${ticketId}\`` : ''
        }`,
        components: [new ActionRowBuilder().addComponents(reopenButton)],
      });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      const channel = interaction.channel;
      const guild = await fetchInteractionGuild(interaction);
      const ticketInfo = parseTicketTopic(channel.topic, 'closed-ticket');
      const { ownerId, typeKey, ticketId, staffRoleId, categoryId, closedCategoryId } =
        ticketInfo || {};
      const isStaff =
        (staffRoleId && interaction.member.roles?.cache?.has(staffRoleId)) ||
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

      if (!channel?.topic?.startsWith('closed-ticket:')) {
        return interaction.reply({
          content: '❌ Este canal não é um ticket fechado.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!isStaff) {
        return interaction.reply({
          content: '❌ Apenas a equipe pode reabrir tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!guild || !staffRoleId) {
        return interaction.reply({
          content: '❌ Não consegui acessar o servidor ou o cargo da equipe para reabrir.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const openCategory = categoryId
        ? await guild.channels.fetch(categoryId).catch(() => null)
        : null;

      await interaction.reply({
        content: '🔓 Ticket sendo reaberto...',
        flags: MessageFlags.Ephemeral,
      });

      if (openCategory?.type === ChannelType.GuildCategory) {
        await channel.setParent(openCategory.id, { lockPermissions: false });
      }

      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: ownerId,
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
      ]);

      if (channel.name.startsWith('fechado-')) {
        await channel.setName(channel.name.replace(/^fechado-/, ''));
      }

      await channel.setTopic(
        `ticket:${ownerId}:${typeKey || 'geral'}:${ticketId || 'sem-id'}:${staffRoleId}:${encodeConfigValue(
          categoryId
        )}:${encodeConfigValue(closedCategoryId)}`
      );
      await channel.send(
        `🔓 Ticket reaberto por ${interaction.user}.${
          ticketId && ticketId !== 'sem-id' ? `\nID do Ticket: \`${ticketId}\`` : ''
        }`
      );
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

// Registra os comandos. Se GUILD_ID existir, registra no servidor informado e aparece quase na hora.
async function registerCommands(clientId) {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;

  if (!token) {
    console.error('Configure DISCORD_TOKEN no arquivo .env antes de iniciar.');
    process.exit(1);
  }

  const { REST, Routes, SlashCommandBuilder } = require('discord.js');

  const commands = [
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Publica o painel para abertura de tickets.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addRoleOption((option) =>
        option
          .setName('cargo_equipe')
          .setDescription('Cargo que poderá ver e atender todos os tickets.')
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName('categoria_tickets')
          .setDescription('Categoria onde os tickets abertos serão criados.')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName('categoria_fechados')
          .setDescription('Categoria onde tickets fechados serão guardados. Se vazio, o bot cria/procura uma.')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('imagem')
          .setDescription('URL pública da imagem do painel. Se vazio, usa PANEL_IMAGE_URL quando existir.')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('terms')
      .setDescription('Publica os termos da Universe Store.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('boasvindas')
      .setDescription('Configura a mensagem automática de boas-vindas.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal onde a mensagem de boas-vindas será enviada.')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName('canal_avisos')
          .setDescription('Canal mencionado na mensagem de boas-vindas.')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('imagem')
          .setDescription('URL pública da imagem/ícone das boas-vindas.')
          .setRequired(false)
      )
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(token);

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });

  console.log('Comandos /painel, /terms e /boasvindas registrados.');
}

(async () => {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    await registerCommands(client.user.id);
  } catch (error) {
    console.error('Erro ao iniciar o bot:', error);
  }
})();
