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
        .setName('핑')
        .setDescription('봇, 디스코드 API, 데이터베이스의 지연 시간을 측정합니다.'),
    
    async execute(interaction) {
        try {
            // 1. 디스코드 API 웹소켓 핑 측정
            const apiPing = interaction.client.ws.ping;

            // 2. 봇 응답 속도 (명령어 입력 인터랙션 생성 타임스탬프 기준 계산)
            const botPing = Date.now() - interaction.createdTimestamp;

            // 3. PostgreSQL 서버 응답 속도 실측
            const pgStart = Date.now();
            let pgStatus = '🟢 정상 작동 중';
            let pgPing = 0;
            
            try {
                await db.query('SELECT 1'); // 가벼운 데이터 쿼리로 지연속도 측정
                pgPing = Date.now() - pgStart;
            } catch (dbError) {
                pgStatus = '🔴 연결 끊김 (오류 발생)';
            }

            // 종합 상태 임베드 빌드
            const pingEmbed = new EmbedBuilder()
                .setTitle('🏓 실론 시스템 핑 및 서버 상태')
                .setColor(pgStatus.startsWith('🟢') ? 0x5865F2 : 0xFF0000)
                .addFields(
                    { name: '🤖 봇 응답 속도 (Latency)', value: `\`${botPing}ms\``, inline: true },
                    { name: '🌐 Discord API 상태', value: `\`${apiPing}ms\``, inline: true },
                    { name: '🐘 PostgreSQL DB 상태', value: `${pgStatus} (지연 시간: \`${pgPing}ms\`)`, inline: false }
                )
                .setFooter({ text: 'by 한입 스튜디오' })
                .setTimestamp();

            await interaction.reply({ embeds: [pingEmbed] });

        } catch (error) {
            handleError(error, '핑 명령어 실행 중 에러 발생', interaction);
        }
    },
};