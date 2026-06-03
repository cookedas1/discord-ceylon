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

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('미니게임')
        .setDescription('미니게임 목록을 확인합니다.'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎮 실론 미니게임')
            .setDescription('아래 드롭다운 메뉴에서 즐길 미니게임을 골라보세요!\n과도한 도박은 자산 탕진의 지름길입니다. 📉')
            .setColor('#FFA500')
            .setTimestamp();

        // 드롭다운 메뉴 생성
        const menu = new StringSelectMenuBuilder()
            .setCustomId('minigame_select')
            .setPlaceholder('🎮 플레이할 게임을 선택하세요')
            .addOptions([
                {
                    label: '🎲 봇과의 주사위 대결',
                    description: '각자 주사위 2개를 던져 합이 높으면 2배! (하루 1회, 최대 10만)',
                    value: 'dice_game',
                },
                {
                    label: '🔫 러시안 물총 쏘기',
                    description: '6개의 약실 중 진짜 물총은 하나! 살아남을 때마다 배율 상승!',
                    value: 'water_gun',
                },
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({ embeds: [embed], components: [row] });
        const logger = require('../utils/logger');
        logger.sendAdminLog(
            interaction.client, 
            '미니게임 실행 완료', 
            `• **플레이어:** <@${interaction.user.id}> (\`${interaction.user.id}\`)\n• **실행 서버:** ${interaction.guild.name}\n• **게임:** ${interaction.options.get('game')?.value}`,
            '#FFCC00' // 임베드 색상 노란색으로 지정
        );
    },
};