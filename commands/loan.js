/** Copyright (C) 2026 HaniB Studio (nageune1010@gmail.com)
 
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
 
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.
 
You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('대출')
        .setDescription('🏦 신용 대출을 받습니다. (최대 순자산의 50%까지 가능, 30초마다 이자 발생)')
        .addIntegerOption(option =>
            option.setName('금액')
                .setDescription('빌리고자 하는 대출 금액을 입력하세요.')
                .setRequired(true)
                .setMinValue(1000)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const amount = interaction.options.getInteger('금액');

        try {
            // 1. 유저 정보 조회 (미가입자 예외 처리)
            const user = await db.checkUser(userId, guildId);
            if (!user) {
                return await interaction.reply({ content: '❌ 자산 계좌가 없습니다. 먼저 주식 시스템에 가입해 주세요.', ephemeral: true });
            }

            const currentCash = parseInt(user.cash);
            const currentLoan = parseInt(user.loan || 0);

            // 2. 유저의 보유 주식 총 가치 계산
            const holdingsRes = await db.query(
                'SELECT h.quantity, s.price FROM holdings h JOIN stocks s ON h.ticker = s.ticker WHERE h.user_id = $1 AND h.guild_id = $2',
                [userId, guildId]
            );
            
            let totalStockValue = 0;
            holdingsRes.rows.forEach(row => {
                totalStockValue += parseInt(row.quantity) * parseInt(row.price);
            });

            // 3. 순자산(Net Worth) 및 대출 한도 계산
            const netWorth = currentCash + totalStockValue - currentLoan;
            const maxLoanLimit = Math.floor(netWorth * 0.5); // 순자산의 50%

            // 순자산이 마이너스이거나 대출 한도가 없는 경우
            if (maxLoanLimit <= 0) {
                return await interaction.reply({
                    content: `🛑 **대출 거절:** 현재 순자산(\`${netWorth.toLocaleString()}원\`)이 부족하거나 담보 가치가 없어 대출을 받을 수 없습니다.`,
                    ephemeral: true
                });
            }

            // 이미 한도를 초과해서 빌리려고 하는 경우
            if (currentLoan + amount > maxLoanLimit) {
                const possibleAmount = maxLoanLimit - currentLoan;
                return await interaction.reply({
                    content: `🛑 **대출 한도 초과:** 유저님의 최대 대출 가능 한도는 **${maxLoanLimit.toLocaleString()}원**입니다.\n현재 이미 **${currentLoan.toLocaleString()}원**을 빌리셨기 때문에, 추가로 빌릴 수 있는 금액은 최대 \`${possibleAmount > 0 ? possibleAmount.toLocaleString() : 0}원\`입니다.`,
                    ephemeral: true
                });
            }

            // 4. 대출 승인 및 DB 반영
            const newCash = currentCash + amount;
            const newLoan = currentLoan + amount;

            await db.query(
            'UPDATE users SET cash = $1, loan = $2, loan_date = NOW() WHERE user_id = $3 AND guild_id = $4', 
            [newCash, newLoan, userId, guildId]
            );

            // 5. 웅장한 대출 완료 임베드 출력
            const embed = new EmbedBuilder()
                .setTitle('🏛️ [실론 중앙은행] 신용대출 승인 통지서')
                .setDescription('귀하가 신청하신 신용대출 건이 정상적으로 승인되어 계좌로 입금되었습니다.')
                .setColor('#FFCC00')
                .addFields(
                    { name: '💵 실행된 대출금', value: `**+ ${amount.toLocaleString()} 원**`, inline: true },
                    { name: '📉 총 대출 잔액', value: `\`${newLoan.toLocaleString()} 원\``, inline: true },
                    { name: '💰 보유 현금 현황', value: `\`${newCash.toLocaleString()} 원\``, inline: false }
                )
                .setFooter({ text: '⚠️ 주의: 30초마다 0.1%의 대출 이자가 원금에 복리로 추가됩니다.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            const logger = require('../utils/logger');
            logger.sendAdminLog(
                interaction.client, 
                '대출 실행 완료', 
                `• **대출자:** <@${userId}> (\`${userId}\`)\n• **실행 서버:** ${interaction.guild.name}\n• **대출 금액:** +${amount.toLocaleString()}원`,
                '#FFCC00' // 임베드 색상 노란색으로 지정
            );

        } catch (error) {
            return handleError(error, '대출 명령어 실행 중 오류 발생', interaction);
        }
    }
};