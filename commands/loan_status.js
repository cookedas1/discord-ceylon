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
        .setName('대출현황')
        .setDescription('📉 현재 나의 대출 잔액과 대출 실행 일자를 확인합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            const user = await db.checkUser(userId, guildId);
            if (!user || parseInt(user.loan || 0) <= 0) {
                return await interaction.reply({
                    content: '😇 현재 대출하신 내역이 없습니다. 신용 상태가 아주 깨끗합니다!',
                    ephemeral: true
                });
            }

            const currentLoan = parseInt(user.loan);
            
            // 📅 날짜 포맷팅 (한국 시간 기준으로 이쁘게 변환)
            let dateString = '기록 없음';
            if (user.loan_date) {
                const loanDate = new Date(user.loan_date);
                dateString = loanDate.toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Asia/Seoul'
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🏛️ [실론 중앙은행] 고객 대출 내역서')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setColor('#FF5555')
                .addFields(
                    { name: '👤 대출자', value: `<@${userId}>`, inline: true },
                    { name: '📉 현재 대출 잔액', value: `**${currentLoan.toLocaleString()} 원**`, inline: true },
                    { name: '📅 최근 대출 실행 일시', value: `\`${dateString}\``, inline: false }
                )
                .setFooter({ text: '※ 30초마다 0.1%의 이자가 원금에 복리로 추가되고 있습니다.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            return handleError(error, '대출현황 조회 중 오류 발생', interaction);
        }
    }
};