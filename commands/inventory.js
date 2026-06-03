const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

// 아이템 메타데이터 (아이템 이름과 이모지 매핑용)
const ITEM_META = {
    'item_ticket_fee': { name: '거래 수수료 1회 면제권', emoji: '🎫' },
    'item_info_insider': { name: '은밀한 찌라시 (내부자 정보)', emoji: '🕵️' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('인벤토리')
        .setDescription('🎒 내가 보유한 특수 아이템 목록을 확인합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            // DB에서 해당 유저의 아이템 목록 가져오기
            const result = await db.query(
                'SELECT item_id, quantity FROM user_inventory WHERE user_id = $1 AND guild_id = $2 AND quantity > 0',
                [userId, guildId]
            );

            const inventoryEmbed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username}님의 인벤토리`)
                .setColor('#2B2D31'); // 디스코드 다크모드 배경색과 어울리는 색상

            if (result.rows.length === 0) {
                inventoryEmbed.setDescription('보유 중인 아이템이 없습니다.\n`/상점` 명령어를 통해 아이템을 구매해 보세요!');
            } else {
                let itemList = '';
                for (const row of result.rows) {
                    const meta = ITEM_META[row.item_id] || { name: '알 수 없는 아이템', emoji: '❓' };
                    itemList += `${meta.emoji} **${meta.name}** : \`${row.quantity}개\`\n`;
                }
                inventoryEmbed.setDescription(itemList);
            }

            await interaction.reply({ embeds: [inventoryEmbed] });

        } catch (error) {
            return handleError(error, '인벤토리 확인 중 오류 발생', interaction);
        }
    }
};