const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('가입')
        .setDescription('실론에 가입합니다.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. 이미 가입되어 있는지 확인 (수정하신 문구 반영)
            const existingUser = await db.checkUser(userId, guildId);
            if (existingUser) {
                return await interaction.reply({
                    content: '❌ 이미 이 서버에서 실론에 가입되어 있습니다!',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // 💡 2. 탈퇴 쿨타임(2일) 제한 확인 로직 추가
            const cooldown = await db.checkWithdrawalCooldown(userId, guildId);
            if (!cooldown.canJoin) {
                return await interaction.reply({
                    content: `🚨 최근 탈퇴 이력이 확인되었습니다! 악용 방지를 위해 **약 ${cooldown.remainingHours}시간** 뒤에 재가입할 수 있습니다.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // 3. 가입 안내 임베드 구성 (환영 문구 제외 커스텀 반영)
            const embed = new EmbedBuilder()
                .setTitle('📜 실론 가입 안내')
                .setDescription(
                    `**[약관 안내]**\n` +
                    `실론 이용에 대한 가입을 하게 된다면 **[운영 정책](https://fair-fiction-878.notion.site/5b4ca436249c489db50ac56c6ea367e5?source=copy_link) 및 [개인정보처리방침](https://fair-fiction-878.notion.site/37112d924c26800bb7d7cfcbf9604719?source=copy_link)**에 동의하는 것으로 간주합니다.`
                )
                .setColor(0x0099FF)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_agree')
                    .setLabel('네, 동의합니다')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('join_deny')
                    .setLabel('아니요')
                    .setStyle(ButtonStyle.Danger)
            );

            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ 본인의 가입창에만 응답할 수 있습니다.', flags: [MessageFlags.Ephemeral] });
                }

                if (i.customId === 'join_agree') {
                    const success = await db.registerUser(userId, guildId);

                    if (success) {
                        // 가입 완료 임베드 (수정하신 짧고 깔끔한 description 반영)
                        const successEmbed = new EmbedBuilder()
                            .setTitle('🎉 가입 완료!')
                            .setDescription('실론 가입이 정상적으로 처리되었습니다.')
                            .setColor(0x00FF00);

                        await i.update({ embeds: [successEmbed], components: [] });
                    } else {
                        throw new Error('registerUser 처리 중 반환값 실패 오류');
                    }

                } else if (i.customId === 'join_deny') {
                    await i.update({
                        content: '👋 가입이 취소되었습니다. 약관에 동의하셔야 서비스를 이용하실 수 있습니다.',
                        embeds: [],
                        components: []
                    });
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await interaction.editReply({
                        content: '⏱️ 가입 대기 시간이 만료되었습니다. 다시 명령어를 입력해 주세요.',
                        components: []
                    });
                }
            });

        } catch (error) {
            handleError(error, '가입 명령어 실행 중 에러 발생', interaction);
        }
    },
};