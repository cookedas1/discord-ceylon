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

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('탈퇴')
        .setDescription('실론에서 탈퇴합니다.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // 가입 여부 확인 (이미 main.js에서 걸러지겠지만 더블 체크)
        const user = await db.checkUser(userId, guildId);
        if (!user) {
            return await interaction.reply({
                content: '❌ 가입되어 있지 않습니다. 먼저 `/가입`을 진행해 주세요.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 경고 임베드
        const warnEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 실론 회원 탈퇴 안내')
            .setDescription('정말로 탈퇴하시겠습니까?\n탈퇴 시 **보유 자산 및 주식 내역이 전부 초기화**되며,\n악용 방지를 위해 **2일(48시간) 동안 재가입이 불가능**합니다.')
            .setTimestamp();

        // 동의 버튼 구성
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_withdraw')
                .setLabel('네, 진짜 탈퇴하겠습니다')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_withdraw')
                .setLabel('아니요, 취소할래요')
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await interaction.reply({
            embeds: [warnEmbed],
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });

        // 버튼 상호작용 수집기 (15초 대기)
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 15000
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'confirm_withdraw') {
                const success = await db.withdrawUser(userId, guildId);
                if (success) {
                    await i.update({
                        content: '✅ 탈퇴 처리가 완료되었습니다. 모든 자산이 초기화되었으며, 2일 뒤에 재가입이 가능합니다.',
                        embeds: [],
                        components: []
                    });
                } else {
                    await i.update({
                        content: '❌ 탈퇴 처리 중 데이터베이스 오류가 발생했습니다. 나중에 다시 시도해 주세요.',
                        embeds: [],
                        components: []
                    });
                }
            } else if (i.customId === 'cancel_withdraw') {
                await i.update({
                    content: '🧹 탈퇴 요청이 취소되었습니다. 계속해서 투자를 즐겨보세요!',
                    embeds: [],
                    components: []
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                await interaction.editReply({
                    content: '⏱️ 시간 초과로 탈퇴 요청이 자동 취소되었습니다.',
                    embeds: [],
                    components: []
                });
            }
        });
    }
};