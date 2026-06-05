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

// ⚙️ 한디리(Koreanbots) 세팅
const BOT_ID = process.env.CLIENT_ID; 
const KOREANBOTS_TOKEN = process.env.KOREANBOTS_TOKEN;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('하트보상받기')
        .setDescription('❤️ 한디리에서 봇을 추천(하트)하고 무료 지원금 100,000원을 받습니다! (12시간 주기)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const rewardAmount = 100000; // 🔥 화끈한 보상 10만원

        try {
            // 1. 유저 가입 여부 확인
            const user = await db.checkUser(userId, guildId);
            if (!user) {
                return await interaction.reply({ content: '❌ 자산 계좌가 없습니다. 주식 시스템에 먼저 가입해 주세요.', ephemeral: true });
            }

            // 2. 12시간 쿨타임 검사 (한디리 추천 리셋 주기)
            if (user.last_heart_claim) {
                const lastClaim = new Date(user.last_heart_claim);
                const now = new Date();
                const diffMs = now - lastClaim;
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours < 12) {
                    const remainingHours = Math.ceil(12 - diffHours);
                    return await interaction.reply({
                        content: `⏳ **아직 리셋되지 않았습니다:** 한디리 추천은 12시간마다 가능합니다.\n다음 보상까지 약 **${remainingHours}시간** 남았습니다.`,
                        ephemeral: true
                    });
                }
            }

            // ⚠️ 개발 단계 임시 패스 (토큰이 없거나 테스트할 때 에러 방지용)
            if (KOREANBOTS_TOKEN.includes('입력')) {
                return await interaction.reply({ content: '⚙️ 개발자 설정: 한디리 토큰이 아직 세팅되지 않았습니다.', ephemeral: true });
            }

            // 3. 한디리 API 공식 호출 (추천 여부 확인)
            await interaction.deferReply({ ephemeral: true }); // API 호출 대기를 위한 디스코드 딜레이 방지

            const response = await fetch(`https://api.koreanbots.dev/v2/bots/${BOT_ID}/vote?user=${userId}`, {
                method: 'GET',
                headers: { 'Authorization': KOREANBOTS_TOKEN }
            });

            const resData = await response.json();

            // 한디리 API의 응답 구조에 맞게 검증 (voted가 true여야 함)
            if (!resData || resData.code !== 200 || !resData.data || !resData.data.voted) {
                return await interaction.editReply({
                    content: `❌ **추천 내역을 찾을 수 없습니다!**\n아래 링크에서 하트(추천)를 꾹 누르신 뒤 다시 명령어를 쳐주세요!\n🔗 [한디리 실론 봇 추천하러 가기](https://koreanbots.dev/bots/${BOT_ID})`
                });
            }

            // 4. 보상 지급 및 DB 업데이트
            const newCash = parseInt(user.cash) + rewardAmount;
            await db.query(
                'UPDATE users SET cash = $1, last_heart_claim = NOW() WHERE user_id = $2 AND guild_id = $3',
                [newCash, userId, guildId]
            );

            // 5. 성공 임베드 날리기
            const embed = new EmbedBuilder()
                .setTitle('❤️ 실론 봇을 응원해 주셔서 감사합니다!')
                .setDescription(`한디리 추천 확인이 정상적으로 완료되어 응원 지원금이 입금되었습니다.`)
                .setColor('#FF4B4B')
                .addFields(
                    { name: '🎁 보상 금액', value: `**+ ${rewardAmount.toLocaleString()} 원**`, inline: true },
                    { name: '💰 현재 보유 현금', value: `\`${newCash.toLocaleString()} 원\``, inline: true }
                )
                .setFooter({ text: '앞으로도 더 유쾌하고 스릴 넘치는 주식 시스템으로 보답하겠습니다!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // 💡 아래에서 만들 어드민 로그 시스템과 연동!
            const logger = require('../utils/logger');
            logger.sendAdminLog(interaction.client, '❤️ 한디리 추천 보상 수령', `<@${userId}> 유저가 \`${interaction.guild.name}\` 서버에서 하트 보상 10만원을 수령했습니다.`);

        } catch (error) {
            return handleError(error, '하트보상받기 명령어 실행 중 오류 발생', interaction);
        }
    }
};