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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('핑')
        .setDescription('⚡ 실론 봇의 상태와 개발 정보를 확인합니다.'),

    async execute(interaction) {
        // 1. 디스코드 API와 웹소켓 지연 시간 계산
        const apiPing = Date.now() - interaction.createdTimestamp;
        const wsPing = interaction.client.ws.ping;

        // 2. 리드미 감성을 살린 깔끔한 임베드 조립
        const embed = new EmbedBuilder()
            .setTitle('🏓 퐁! 실론(Ceylon) 시스템 상태')
            .setDescription('> 실론 시스템 상태')
            .setColor('#5865F2') // 디스코드 공식 시그니처 색상
            .addFields(
                { 
                    name: '📡 지연 시간 (Ping)', 
                    value: `🟢 **Websocket:** \`${wsPing}ms\`\n🔵 **API Latency:** \`${apiPing}ms\``, 
                    inline: false 
                },
                { 
                    name: '📦 개발 환경 (Environment)', 
                    value: '• **Runtime:** `Node.js v22`\n• **Database:** `PostgreSQL v18`\n• **VCS:** `Git`', 
                    inline: true 
                },
                { 
                    name: '👥 크레딧 (Credits)', 
                    value: '• **Studio:** HanibStudio\n• **Director:** [cookedas1](https://github.com/cookedas1)', 
                    inline: false 
                }
            )
            .setFooter({ text: '본 디스코드 봇은 cookedas1의 discord-ceylon을 기반으로 두고 있습니다.' })
            .setTimestamp();

        // 3. 임베드 전송
        await interaction.reply({ embeds: [embed] });
    }
};