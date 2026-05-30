const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    async handleInteraction(interaction) {
        
        // 1. 드롭다운 메뉴를 선택했을 때
        if (interaction.isStringSelectMenu() && interaction.customId === 'minigame_select') {
            const selected = interaction.values[0];

            // 🎲 [게임 1] 주사위 대결 선택 시 -> 배팅금 입력 모달창 띄우기
            if (selected === 'dice_game') {
                // [DB 체크 예시] 오늘 이미 플레이했는지 검증
                // const user = await db.query('SELECT last_dice_game FROM users WHERE user_id = $1', [interaction.user.id]);
                // const today = new Date().toISOString().split('T')[0];
                // if (user.rows[0]?.last_dice_game === today) {
                //     return interaction.reply({ content: '❌ 주사위 대결은 하루에 한 번만 참여할 수 있습니다! 내일 다시 도전하세요.', ephemeral: true });
                // }

                const modal = new ModalBuilder()
                    .setCustomId('dice_modal')
                    .setTitle('🎲 주사위 대결 배팅');

                const betInput = new TextInputBuilder()
                    .setCustomId('dice_bet_amount')
                    .setLabel('배팅할 코인 액수를 입력하세요 (최대 10만)')
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
                    .setDescription('6개의 약실 중 **단 한 곳**에만 시원한 물이 장전되어 있습니다.\n방아쇠를 당겨 생존할 때마다 보상이 늘어납니다!\n\n**현재 보상:** 참가비 1,000 코인 ➡️ 성공 시 1.5배!')
                    .setColor('#00FFFF');

                const shootBtn = new ButtonBuilder().setCustomId('gun_shoot_1').setLabel('🔫 방아쇠 당기기').setStyle(ButtonStyle.Danger);
                const stopBtn = new ButtonBuilder().setCustomId('gun_stop_1').setLabel('💰 그만하고 코인 챙기기').setStyle(ButtonStyle.Success).setDisabled(true);

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
                return interaction.reply({ content: '❌ 최대 배팅금은 100,000 코인입니다!', ephemeral: true });
            }

            // [DB 체크 예시] 유저 잔액 확인
            // const res = await db.query('SELECT coins FROM users WHERE user_id = $1', [interaction.user.id]);
            // if (res.rows[0].coins < betAmount) return interaction.reply({ content: '❌ 가진 코인이 부족합니다!', ephemeral: true });

            // 주사위 굴리기 (각자 2개씩)
            const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const user1 = Math.floor(Math.random() * 6) + 1;
            const user2 = Math.floor(Math.random() * 6) + 1;
            const bot1 = Math.floor(Math.random() * 6) + 1;
            const bot2 = Math.floor(Math.random() * 6) + 1;

            const userSum = user1 + user2;
            const botSum = bot1 + bot2;

            let resultTitle = '';
            let resultDesc = '';
            let finalColor = '#FFFF00';

            if (userSum > botSum) {
                resultTitle = '🎉 주사위 대결 승리!';
                resultDesc = `축하합니다! 배팅금의 2배인 **${(betAmount * 2).toLocaleString()} 코인**을 획득하셨습니다!`;
                finalColor = '#00FF00';
                // [DB 반영] coins = coins + betAmount, last_dice_game = 오늘날짜
            } else if (userSum < botSum) {
                resultTitle = '💸 주사위 대결 패배...';
                resultDesc = `안타깝네요! **${betAmount.toLocaleString()} 코인**을 잃었습니다.`;
                finalColor = '#FF0000';
                // [DB 반영] coins = coins - betAmount, last_dice_game = 오늘날짜
            } else {
                resultTitle = '🤝 무승부!';
                resultDesc = `합계가 같습니다! 배팅금 **${betAmount.toLocaleString()} 코인**이 그대로 반환됩니다.`;
                // [DB 반영] last_dice_game = 오늘날짜만 기록
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
        
        // 🔫 러시안 물총 버튼 로직 (간단 구현 버전)
        if (interaction.isButton() && interaction.customId.startsWith('gun_shoot_')) {
            const stage = parseInt(interaction.customId.split('_')[2]); // 현재 몇 번째 격발인지
            
            // 1/6 확률로 물총 발사 (약실 1개)
            const isWater = Math.floor(Math.random() * 6) === 0; 

            if (isWater) {
                const failEmbed = new EmbedBuilder()
                    .setTitle('💦 푸쉬이익!!!')
                    .setDescription(`정통으로 물을 맞았습니다! 탈락! 💦\n참가비 1,000 코인을 날렸습니다.`)
                    .setColor('#FF0000');
                // [DB 반영] 코인 차감
                await interaction.update({ embeds: [failEmbed], components: [] });
            } else {
                const nextStage = stage + 1;
                const multiplier = (1.0 + stage * 0.5).toFixed(1); // 생존할 때마다 배율 1.5배, 2.0배... 증가

                const winEmbed = new EmbedBuilder()
                    .setTitle('철컥... 안전합니다! 🎖️')
                    .setDescription(`휴! 살아남으셨습니다.\n현재 생존 횟수: **${stage}회**\n\n지금 그만두면 **${(1000 * multiplier).toLocaleString()} 코인**을 챙길 수 있습니다!`)
                    .setColor('#00FF00');

                const nextShoot = new ButtonBuilder().setCustomId(`gun_shoot_${nextStage}`).setLabel('🔫 다음 방아쇠 당기기').setStyle(ButtonStyle.Danger);
                const stopBtn = new ButtonBuilder().setCustomId(`gun_stop_${stage}`).setLabel('💰 코인 챙겨서 도망치기').setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder().addComponents(nextShoot, stopBtn);
                await interaction.update({ embeds: [winEmbed], components: [row] });
            }
        }

        // 러시안 물총 도망치기 버튼
        if (interaction.isButton() && interaction.customId.startsWith('gun_stop_')) {
            const stage = parseInt(interaction.customId.split('_')[2]);
            const multiplier = (1.0 + stage * 0.5).toFixed(1);
            const reward = 1000 * multiplier;

            const stopEmbed = new EmbedBuilder()
                .setTitle('💰 영리한 퇴장!')
                .setDescription(`현명하군요! 물총을 맞기 전에 **${reward.toLocaleString()} 코인**을 챙겨 안전하게 퇴장했습니다.`)
                .setColor('#FFFF00');
            // [DB 반영] 코인 지급

            await interaction.update({ embeds: [stopEmbed], components: [] });
        }
    }
};