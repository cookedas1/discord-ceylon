const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('상환')
        .setDescription('🪙 은행에 빌린 대출금을 상환합니다.')
        .addIntegerOption(option =>
            option.setName('금액')
                .setDescription('상환할 금액을 입력하세요. (빚보다 크게 입력하면 전액 상환됩니다.)')
                .setRequired(true)
                .setMinValue(100)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        let amount = interaction.options.getInteger('금액');

        try {
            // 1. 유저 정보 조회
            const user = await db.checkUser(userId, guildId);
            if (!user) {
                return await interaction.reply({ content: '❌ 등록된 자산 계좌가 없습니다.', ephemeral: true });
            }

            const currentCash = parseInt(user.cash);
            const currentLoan = parseInt(user.loan || 0);

            // 2. 빚이 없는 경우 예외 처리
            if (currentLoan <= 0) {
                return await interaction.reply({ content: '😇 귀하는 현재 갚아야 할 대출금이 없습니다! 깨끗한 신용 상태입니다.', ephemeral: true });
            }

            // 3. 보유 현금이 상환하려는 금액보다 적은 경우
            if (currentCash < amount) {
                return await interaction.reply({ 
                    content: `❌ **잔액 부족:** 상환하려면 \`${amount.toLocaleString()}원\`이 필요하지만, 현재 보유 중인 현금은 \`${currentCash.toLocaleString()}원\`뿐입니다.`, 
                    ephemeral: true 
                });
            }

            // 4. 전액 상환 캡핑 (갚을 빚보다 더 큰 금액을 입력한 경우 빚만큼만 깎기)
            if (amount > currentLoan) {
                amount = currentLoan;
            }

            // 5. DB 반영
            const newCash = currentCash - amount;
            const newLoan = currentLoan - amount;

            await db.query('UPDATE users SET cash = $1, loan = $2 WHERE user_id = $3 AND guild_id = $4', [newCash, newLoan, userId, guildId]);

            // 6. 상환 완료 임베드 출력
            const embed = new EmbedBuilder()
                .setTitle('🪙 [실론 중앙은행] 대출금 상환 확인서')
                .setDescription('신청하신 대출금 상환 처리가 안전하게 완료되었습니다.')
                .setColor('#00FF7F')
                .addFields(
                    { name: '📉 상환된 금액', value: `**- ${amount.toLocaleString()} 원**`, inline: true },
                    { name: '🏛️ 남은 대출 잔액', value: `**${newLoan.toLocaleString()} 원**`, inline: true },
                    { name: '💰 남은 현금 잔액', value: `\`${newCash.toLocaleString()} 원\``, inline: false }
                )
                .setFooter({ text: '실론 중앙은행을 이용해 주셔서 감사합니다.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            return handleError(error, '상환 명령어 실행 중 오류 발생', interaction);
        }
    }
};