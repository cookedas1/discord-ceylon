const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

// ⚙️ 보안 설정: 여기에 명령어를 실행할 수 있는 허가된 서버ID와 유저ID를 적으세요!
const ADMIN_GUILD_ID = '1470614389232107602';
const ADMIN_USER_ID = '842317442474967050';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('관리')
        .setDescription('👑 [개발자 전용] 특정 유저의 전 서버 자산 상태를 조회하고 원격 수정합니다.')
        .addUserOption(option => 
            option.setName('유저')
                .setDescription('자산을 관리할 타겟 유저를 선택하세요.')
                .setRequired(true)
        ),

    async execute(interaction) {
        // 🔒 강력한 권한 검증 검사
        if (interaction.guild.id !== ADMIN_GUILD_ID || interaction.user.id !== ADMIN_USER_ID) {
            return await interaction.reply({ 
                content: '❌ **권한 거절:** 이 명령어는 한입 스튜디오 실론 디렉터만 사용할 수 있습니다.', 
                ephemeral: true 
            });
        }

        const targetUser = interaction.options.getUser('유저');

        try {
            // 1. 해당 유저가 가입된 모든 서버의 자산 데이터 긁어오기
            const userRowsRes = await db.query(
                'SELECT guild_id, cash, loan FROM users WHERE user_id = $1', 
                [targetUser.id]
            );

            if (userRowsRes.rows.length === 0) {
                return await interaction.reply({ 
                    content: `❌ <@${targetUser.id}> 유저가 실론 주식 시스템에 가입한 서버 내역이 존재하지 않습니다.`, 
                    ephemeral: true 
                });
            }

            // 2. 가입된 서버 리스트를 드롭다운 메뉴로 빌드
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('admin_guild_select')
                .setPlaceholder('⚙️ 관리할 서버를 선택해 주세요.');

            userRowsRes.rows.forEach(row => {
                // 봇이 들어가 있는 서버라면 서버 이름을 가져오고, 없다면 ID 표시
                const guildName = interaction.client.guilds.cache.get(row.guild_id)?.name || `알 수 없는 서버 (${row.guild_id})`;
                
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(guildName)
                        .setDescription(`현금: ₩${parseInt(row.cash).toLocaleString()} | 대출: ₩${parseInt(row.loan || 0).toLocaleString()}`)
                        .setValue(row.guild_id)
                );
            });

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const response = await interaction.reply({
                content: `🔍 **[전서버 유저 관리]** <@${targetUser.id}> 님의 자산이 동기화된 서버 리스트입니다.`,
                components: [row],
                ephemeral: true
            });

            // 콜렉터 생성 (선택 및 버튼 컴포넌트 제어용)
            const collector = response.createMessageComponentCollector({
                time: 60000
            });

            let selectedGuildId = null;

            collector.on('collect', async i => {
                // 자신이 친 메뉴만 작동하게 방어
                if (i.user.id !== interaction.user.id) return;

                // 상황 1: 서버 드롭다운을 골랐을 때 -> 해당 서버 자산 세부 정보 및 수정 버튼 출력
                if (i.customId === 'admin_guild_select') {
                    selectedGuildId = i.values[0];
                    
                    const statusRes = await db.query(
                        'SELECT cash, loan FROM users WHERE user_id = $1 AND guild_id = $2',
                        [targetUser.id, selectedGuildId]
                    );
                    const currentData = statusRes.rows[0];
                    const targetGuildName = interaction.client.guilds.cache.get(selectedGuildId)?.name || '외부 서버';

                    const embed = new EmbedBuilder()
                        .setTitle(`👑 유저 자산 원격 관리 패널`)
                        .setDescription(`**대상 유저:** <@${targetUser.id}>\n**선택된 서버:** ${targetGuildName} (\`${selectedGuildId}\`)`)
                        .setColor('#00FFFF')
                        .addFields(
                            { name: '💵 보유 현금', value: `\`${parseInt(currentData.cash).toLocaleString()} 원\``, inline: true },
                            { name: '🏛️ 대출 잔액', value: `\`${parseInt(currentData.loan || 0).toLocaleString()} 원\``, inline: true }
                        )
                        .setTimestamp();

                    const buttons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_edit_cash').setLabel('💵 현금 수정').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_edit_loan').setLabel('🏛️ 대출 수정').setStyle(ButtonStyle.Danger)
                    );

                    await i.update({ embeds: [embed], components: [buttons] });
                }

                // 상황 2: 현금 수정 버튼을 눌렀을 때 -> 모달 팝업 띄우기
                else if (i.customId === 'btn_edit_cash') {
                    const modal = new ModalBuilder().setCustomId('modal_edit_cash').setTitle('💵 유저 현금 금액 원격 조정');
                    const cashInput = new TextInputBuilder()
                        .setCustomId('input_cash_value')
                        .setLabel('설정할 새로운 현금 액수를 입력하세요.')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);
                    
                    modal.addComponents(new ActionRowBuilder().addComponents(cashInput));
                    await i.showModal(modal);

                    // 모달 제출 대기 및 처리
                    const submitted = await i.awaitModalSubmit({ time: 30000 }).catch(() => null);
                    if (submitted) {
                        const newCashVal = parseInt(submitted.fields.getTextInputValue('input_cash_value'));
                        if (isNaN(newCashVal)) {
                            return await submitted.reply({ content: '❌ 올바른 숫자 형식을 입력하세요.', ephemeral: true });
                        }

                        await db.query('UPDATE users SET cash = $1 WHERE user_id = $2 AND guild_id = $3', [newCashVal, targetUser.id, selectedGuildId]);
                        await submitted.reply({ content: `✅ 성공적으로 유저의 현금을 **${newCashVal.toLocaleString()}원**으로 강제 조정했습니다.`, ephemeral: true });
                        collector.stop();
                    }
                }

                // 상황 3: 대출 수정 버튼을 눌렀을 때 -> 모달 팝업 띄우기
                else if (i.customId === 'btn_edit_loan') {
                    const modal = new ModalBuilder().setCustomId('modal_edit_loan').setTitle('🏛️ 유저 대출 잔액 원격 조정');
                    const loanInput = new TextInputBuilder()
                        .setCustomId('input_loan_value')
                        .setLabel('설정할 새로운 대출 잔액을 입력하세요. (0=탕감)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);
                    
                    modal.addComponents(new ActionRowBuilder().addComponents(loanInput));
                    await i.showModal(modal);

                    // 모달 제출 대기 및 처리
                    const submitted = await i.awaitModalSubmit({ time: 30000 }).catch(() => null);
                    if (submitted) {
                        const newLoanVal = parseInt(submitted.fields.getTextInputValue('input_loan_value'));
                        if (isNaN(newLoanVal)) {
                            return await submitted.reply({ content: '❌ 올바른 숫자 형식을 입력하세요.', ephemeral: true });
                        }

                        await db.query('UPDATE users SET loan = $1 WHERE user_id = $2 AND guild_id = $3', [newLoanVal, targetUser.id, selectedGuildId]);
                        await submitted.reply({ content: `✅ 성공적으로 유저의 대출 잔액을 **${newLoanVal.toLocaleString()}원**으로 강제 조정했습니다.`, ephemeral: true });
                        collector.stop();
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try { await interaction.editReply({ content: '⏱️ 관리 패널 세션이 만료되었습니다.', components: [] }); } catch(e){}
                }
            });

        } catch (error) {
            return handleError(error, '유저 원격 관리 명령 실행 중 치명적 오류', interaction);
        }
    }
};