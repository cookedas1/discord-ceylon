const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

// ⚙️ 본부 서버 ID 셋팅 (여기에 실제 서포트 서버 ID 입력)
const SUPPORT_SERVER_ID = '1470614389232107602';
const SUPPORT_SERVER_INVITE = 'https://discord.gg/Ftnsy8ByGV';

// 📦 상점 아이템 목록 (나중을 위해 모듈화하기 좋게 배열로 관리)
const SHOP_ITEMS = [
    {
        id: 'item_ticket_fee',
        label: '거래 수수료 1회 면제권',
        description: '다음 주식 매도 시 수수료를 100% 면제받습니다.',
        price: 500000,
        emoji: '🎫'
    },
    {
        id: 'item_info_insider',
        label: '은밀한 찌라시 (내부자 정보)',
        description: '다음 주가 변동장에 호재가 뜰지 악재가 뜰지 슬쩍 알려줍니다.',
        price: 1500000,
        emoji: '🕵️'
    }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('상점')
        .setDescription('🛒 특별한 주식 아이템을 구매합니다!'),

    async execute(interaction) {
        try {
            // 🚨 1. 서포트 서버인지 검사
            if (interaction.guildId !== SUPPORT_SERVER_ID) {
                const inviteEmbed = new EmbedBuilder()
                    .setTitle('해당 명령어는 공식 서포트 서버에서만 이용할 수 있습니다.')
                    .setDescription(`아이템 상점은 **실론 봇 공식 서포트 서버**에서만 이용할 수 있습니다.\n아래 링크로 입장해서 희귀 아이템을 구매해 보세요!`)
                    .setColor('#FF4B4B')
                    .addFields({ name: '🔗 공식 서버 입장', value: SUPPORT_SERVER_INVITE });
                
                return await interaction.reply({ embeds: [inviteEmbed], ephemeral: true });
            }

            // 2. 유저 데이터 확인
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const user = await db.checkUser(userId, guildId);

            if (!user) {
                return await interaction.reply({ content: '❌ 먼저 주식 계좌를 개설해 주세요.', ephemeral: true });
            }

            // 3. 상점 임베드 조립
            const shopEmbed = new EmbedBuilder()
                .setTitle('🛒 실론 뒷골목 비밀 상점')
                .setDescription(`환영합니다, <@${userId}>님. 돈만 있다면 뭐든 구할 수 있죠.\n\n💰 **내 잔고:** \`${parseInt(user.cash).toLocaleString()} 원\``)
                .setColor('#FFD700')
                .setThumbnail('https://i.imgur.com/your-shop-icon.png') // 상점 느낌 나는 이미지 링크 넣으면 좋음!
                .setFooter({ text: '원하는 아이템을 아래 메뉴에서 선택해 주세요.' });

            // 4. 선택 메뉴(Select Menu) 조립
            const options = SHOP_ITEMS.map(item => ({
                label: item.label,
                description: `${item.price.toLocaleString()} 원 | ${item.description}`,
                value: item.id,
                emoji: item.emoji
            }));

            const selectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_menu')
                    .setPlaceholder('구매할 아이템을 선택하세요...')
                    .addOptions(options)
            );

            // 5. 상점 오픈!
            await interaction.reply({ embeds: [shopEmbed], components: [selectMenu] });

        } catch (error) {
            return handleError(error, '상점 명령어 실행 중 오류 발생', interaction);
        }
    }
};