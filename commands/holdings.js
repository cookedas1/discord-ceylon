const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('보유')
        .setDescription('현재 자신이 보유 중인 주식 잔고와 자산 현황을 확인합니다.'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. 유저의 기본 정보 (현재 보유 현금) 조회
            const user = await db.checkUser(userId, guildId);
            if (!user) {
                return await interaction.reply({
                    content: '❌ 가입 정보가 없습니다. 먼저 `/가입` 명령어를 이용해주세요.',
                    ephemeral: true
                });
            }

            // 2. 유저가 보유한 주식 목록과 실시간 주가를 JOIN해서 가져오기
            // 수량이 1주 이상인 주식들만 필터링하여 가져옵니다.
            const holdingsRes = await db.query(`
                SELECT h.ticker, s.name, h.quantity, s.price
                FROM holdings h
                JOIN stocks s ON UPPER(h.ticker) = UPPER(s.ticker)
                WHERE h.user_id = $1 AND h.guild_id = $2 AND h.quantity > 0
                ORDER BY s.name ASC
            `, [userId, guildId]);

            // 3. 서버 닉네임 가져오기
            const nickname = interaction.member ? interaction.member.displayName : interaction.user.displayName;
            
            // 4. 자산 현황 계산 및 보유 주식 텍스트 빌드
            let totalStockEvaluation = BigInt(0); // 총 주식 평가금액
            let holdingsText = '';

            if (holdingsRes.rows.length === 0) {
                holdingsText = '현재 보유 중인 주식이 없습니다. `/주식매수`로 투자를 시작해 보세요!';
            } else {
                holdingsRes.rows.forEach(row => {
                    const quantity = BigInt(row.quantity);
                    const currentPrice = BigInt(row.price);
                    const evaluation = quantity * currentPrice; // 해당 종목 평가금액 (수량 * 현재가)
                    totalStockEvaluation += evaluation;

                    holdingsText += `📈 **${row.name} (${row.ticker})**\n` +
                                   `• 보유 수량: \`${quantity.toLocaleString()} 주\`\n` +
                                   `• 현재 주가: \`₩${currentPrice.toLocaleString()}\`\n` +
                                   `• 평가 금액: \`₩${evaluation.toLocaleString()}\`\n\n`;
                });
            }

            const cash = BigInt(user.cash);
            const totalAssets = cash + totalStockEvaluation; // 총 자산 = 현금 + 주식 평가액

            // 5. 종합 자산 현황 임베드 구성
            const embed = new EmbedBuilder()
                .setTitle(`💼 ${nickname}님의 종합 자산 현황`)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false, size: 512 }))
                .setColor(0x5865F2)
                .addFields(
                    { 
                        name: '📊 자산 요약', 
                        value: `💵 **보유 현금:** \`₩${cash.toLocaleString()}\`\n` +
                               `💹 **주식 평가액:** \`₩${totalStockEvaluation.toLocaleString()}\`\n` +
                               `💳 **총 자산 (현금+주식):** \`₩${totalAssets.toLocaleString()}\``, 
                        inline: false 
                    },
                    { 
                        name: '📋 보유 주식 리스트', 
                        value: holdingsText, 
                        inline: false 
                    }
                )
                .setFooter({ text: '실론 실시간 자산 관리 시스템' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            handleError(error, '보유 명령어 실행 중 에러 발생', interaction);
        }
    },
};