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

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    async handleInteraction(interaction) {
        
        // 1. 드롭다운 메뉴를 선택했을 때
        if (interaction.isStringSelectMenu() && interaction.customId === 'minigame_select') {
            const selected = interaction.values[0];

            // 🎲 [게임 1] 주사위 대결 선택 시 -> 배팅금 입력 모달창 띄우기
            if (selected === 'dice_game') {
                // 오늘 이미 플레이했는지 검증 (main.js에서 가입 여부를 필터링하므로 무조건 row가 존재함)
                const userRes = await db.query('SELECT last_dice_game FROM users WHERE user_id = $1 AND guild_id = $2', [interaction.user.id, interaction.guild.id]);
                const today = new Date().toISOString().split('T')[0];
                
                const lastGame = userRes.rows[0]?.last_dice_game 
                    ? new Date(userRes.rows[0].last_dice_game).toISOString().split('T')[0] 
                    : null;

                if (lastGame === today) {
                    return interaction.reply({ content: '❌ 주사위 대결은 하루에 한 번만 참여할 수 있습니다! 내일 다시 도전하세요.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId('dice_modal')
                    .setTitle('🎲 주사위 대결 배팅');

                const betInput = new TextInputBuilder()
                    .setCustomId('dice_bet_amount')
                    .setLabel('배팅할 액수를 입력하세요 (최대 10만 캐시)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('예: 50000')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(betInput));
                await interaction.showModal(modal);
            }

            // 🔫 [게임 2] 러시안 물총 선택 시 -> 인터랙티브 버튼 게임 시작
            if (selected === 'water_gun') {
                const gunEmbed = new EmbedBuilder()
                    .setTitle('🔫 러시안 물총 쏘기')
                    .setDescription('6개의 약실 중 **단 한 곳**에만 시원한 물이 장전되어 있습니다.\n방아쇠를 당겨 생존할 때마다 보상이 늘어납니다!\n\n**현재 보상:** 참가비 1,000 캐시 ➡️ 성공 시 1.5배!')
                    .setColor('#00FFFF');

                const shootBtn = new ButtonBuilder().setCustomId('gun_shoot_1').setLabel('🔫 방아쇠 당기기').setStyle(ButtonStyle.Danger);
                const stopBtn = new ButtonBuilder().setCustomId('gun_stop_1').setLabel('💰 그만하고 돈 챙기기').setStyle(ButtonStyle.Success).setDisabled(true);

                const row = new ActionRowBuilder().addComponents(shootBtn, stopBtn);
                await interaction.reply({ embeds: [gunEmbed], components: [row] });
            }
        }

        // 2. 주사위 모달창이 제출되었을 때
        if (interaction.isModalSubmit() && interaction.customId === 'dice_modal') {
            const betAmount = parseInt(interaction.fields.getTextInputValue('dice_bet_amount'));

            // 입력값 검증
            if (isNaN(betAmount) || betAmount <= 0) {
                return interaction.reply({ content: '❌ 올바른 숫자를 입력해 주세요!', ephemeral: true });
            }
            if (betAmount > 100000) {
                return interaction.reply({ content: '❌ 최대 배팅금은 100,000 캐시입니다!', ephemeral: true });
            }

            // 유저 잔액 확인 (coins 대신 cash 사용)
            const balanceRes = await db.query('SELECT cash FROM users WHERE user_id = $1 AND guild_id = $2', [interaction.user.id, interaction.guild.id]);
            if (balanceRes.rows[0].cash < betAmount) {
                return interaction.reply({ content: '❌ 가진 캐시가 부족합니다!', ephemeral: true });
            }

            // 주사위 굴리기 (각자 2개씩)
            const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const user1 = Math.floor(Math.random() * 6) + 1;
            const user2 = Math.floor(Math.random() * 6) + 1;
            const bot1 = Math.floor(Math.random() * 6) + 1;
            const bot2 = Math.floor(Math.random() * 6) + 1;

            const userSum = user1 + user2;
            const botSum = bot1 + bot2;

            const today = new Date().toISOString().split('T')[0];

            let resultTitle = '';
            let resultDesc = '';
            let finalColor = '#FFFF00';

            if (userSum > botSum) {
                resultTitle = '🎉 주사위 대결 승리!';
                resultDesc = `축하합니다! 배팅금의 2배인 **${(betAmount * 2).toLocaleString()} 캐시**를 획득하셨습니다!`;
                finalColor = '#00FF00';
                // 승리 시: 원래 냈던 돈 포함해서 2배를 돌려받는 개념이므로 결과적으로 +betAmount 만큼 증가
                await db.query('UPDATE users SET cash = cash + $1, last_dice_game = $2 WHERE user_id = $3 AND guild_id = $4', [betAmount, today, interaction.user.id, interaction.guild.id]);
            } else if (userSum < botSum) {
                resultTitle = '💸 주사위 대결 패배...';
                resultDesc = `안타깝네요! **${betAmount.toLocaleString()} 캐시**를 잃었습니다.`;
                finalColor = '#FF0000';
                // 패배 시: 배팅금 차감
                await db.query('UPDATE users SET cash = cash - $1, last_dice_game = $2 WHERE user_id = $3 AND guild_id = $4', [betAmount, today, interaction.user.id, interaction.guild.id]);
            } else {
                resultTitle = '🤝 무승부!';
                resultDesc = `합계가 같습니다! 배팅금 **${betAmount.toLocaleString()} 캐시**가 그대로 반환됩니다.`;
                // 무승부 시: 돈은 그대로 두고 제한 날짜만 기록
                await db.query('UPDATE users SET last_dice_game = $1 WHERE user_id = $2 AND guild_id = $3', [today, interaction.user.id, interaction.guild.id]);
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle(resultTitle)
                .setColor(finalColor)
                .addFields(
                    { name: `🙋‍♂️ ${interaction.user.username}의 주사위`, value: `${diceEmojis[user1-1]} + ${diceEmojis[user2-1]} = **${userSum}**`, inline: true },
                    { name: `🤖 실론의 주사위`, value: `${diceEmojis[bot1-1]} + ${diceEmojis[bot2-1]} = **${botSum}**`, inline: true },
                    { name: '결과', value: resultDesc }
                );

            await interaction.reply({ embeds: [resultEmbed] });
        }
        
        // 🔫 러시안 물총 버튼 로직
        if (interaction.isButton() && interaction.customId.startsWith('gun_shoot_')) {
            const stage = parseInt(interaction.customId.split('_')[2]); // 현재 몇 번째 격발인지
            
            // 첫 방아쇠 당길 때만 참가비 1,000 캐시 선차감 및 잔고 확인
            if (stage === 1) {
                const balanceRes = await db.query('SELECT cash FROM users WHERE user_id = $1 AND guild_id = $2', [interaction.user.id, interaction.guild.id]);
                if (balanceRes.rows[0].cash < 1000) {
                    return interaction.reply({ content: '❌ 러시안 물총 게임 참가비 (1,000 캐시)가 부족합니다!', ephemeral: true });
                }
                // 선차감 진행
                await db.query('UPDATE users SET cash = cash - 1000 WHERE user_id = $1 AND guild_id = $2', [interaction.user.id, interaction.guild.id]);
            }

            // 1/6 확률로 물총 발사 (약실 1개)
            const isWater = Math.floor(Math.random() * 6) === 0; 

            if (isWater) {
                const failEmbed = new EmbedBuilder()
                    .setTitle('💦 푸쉬이익!!!')
                    .setDescription(`정통으로 물을 맞았습니다! 탈락! 💦\n이미 지불한 참가비 1,000 캐시는 공중분해 되었습니다.`)
                    .setColor('#FF0000');
                
                // 이미 선차감했으므로 추가 DB 차감은 없음
                await interaction.update({ embeds: [failEmbed], components: [] });
            } else {
                const nextStage = stage + 1;
                const multiplier = (1.0 + stage * 0.5).toFixed(1); // 생존할 때마다 배율 1.5배, 2.0배... 증가

                const winEmbed = new EmbedBuilder()
                    .setTitle('철컥... 안전합니다! 🎖️')
                    .setDescription(`휴! 살아남으셨습니다.\n현재 생존 횟수: **${stage}회**\n\n지금 그만두면 **${(1000 * multiplier).toLocaleString()} 캐시**를 챙길 수 있습니다!`)
                    .setColor('#00FF00');

                const nextShoot = new ButtonBuilder().setCustomId(`gun_shoot_${nextStage}`).setLabel('🔫 다음 방아쇠 당기기').setStyle(ButtonStyle.Danger);
                const stopBtn = new ButtonBuilder().setCustomId(`gun_stop_${stage}`).setLabel('💰 캐시 챙겨서 도망치기').setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder().addComponents(nextShoot, stopBtn);
                await interaction.update({ embeds: [winEmbed], components: [row] });
            }
        }

        // 러시안 물총 도망치기 버튼 (보상 지급)
        if (interaction.isButton() && interaction.customId.startsWith('gun_stop_')) {
            const stage = parseInt(interaction.customId.split('_')[2]);
            const multiplier = (1.0 + stage * 0.5).toFixed(1);
            const reward = 1000 * multiplier;

            const stopEmbed = new EmbedBuilder()
                .setTitle('💰 영리한 퇴장!')
                .setDescription(`현명하군요! 물총을 맞기 전에 **${reward.toLocaleString()} 캐시**를 챙겨 안전하게 퇴장했습니다.`)
                .setColor('#FFFF00');
            
            // 처음에 1000 캐시를 뺐으므로, 배율이 적용된 최종 금액을 그대로 지급하면 됨
            await db.query('UPDATE users SET cash = cash + $1 WHERE user_id = $2 AND guild_id = $3', [reward, interaction.user.id, interaction.guild.id]);

            await interaction.update({ embeds: [stopEmbed], components: [] });
        }
    }
};