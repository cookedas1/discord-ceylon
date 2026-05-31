const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    // 💡 입력 옵션 없이 깔끔하게 명령어만 남겨 편리하게 호출합니다.
    data: new SlashCommandBuilder()
        .setName('주식매도')
        .setDescription('보유 중인 주식을 시장에 되팔아 캐시화합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. 유저가 '실제로 보유 중인(수량 > 0)' 주식 목록과 주가 정보 가져오기
            const holdingsRes = await db.query(`
                SELECT h.ticker, s.name, h.quantity, s.price
                FROM holdings h
                JOIN stocks s ON UPPER(h.ticker) = UPPER(s.ticker)
                WHERE h.user_id = $1 AND h.guild_id = $2 AND h.quantity > 0
                ORDER BY s.name ASC
            `, [userId, guildId]);

            // 보유 중인 주식이 아예 없는 경우 컷
            if (holdingsRes.rows.length === 0) {
                return await interaction.reply({ 
                    content: '❌ 현재 매도할 수 있는 보유 주식이 없습니다! 먼저 `/주식매수`를 통해 주식을 구매해 보세요.', 
                    ephemeral: true 
                });
            }

            // 2. 보유 중인 주식들로만 드롭다운(Select Menu) 생성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('sell_stock_select')
                .setPlaceholder('📉 되팔아 캐시화할 주식을 선택해 주세요')
                .addOptions(
                    holdingsRes.rows.map(row => ({
                        label: `${row.name} (${row.ticker})`,
                        description: `보유: ${parseInt(row.quantity).toLocaleString()}주 | 현재가: ₩${row.price.toLocaleString()}`,
                        value: row.ticker
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🛒 주식 매도 센터')
                .setDescription('현재 보유 중인 주식 목록입니다. 판매하려는 종목을 선택해 주세요.')
                .setColor(0xF54242); // 매도는 빨간색 테마

            // 본인만 깔끔하게 볼 수 있도록 ephemeral 처리
            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

            // 3. 선택 메뉴 콜렉터 가동
            const collector = response.createMessageComponentCollector({
                time: 60000 // 1분 대기
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ 본인의 매도 창에서만 선택할 수 있습니다.', ephemeral: true });
                }

                if (i.customId === 'sell_stock_select') {
                    const ticker = i.values[0];
                    
                    // 선택한 종목의 실시간 보유 정보를 찾음
                    const targetHolding = holdingsRes.rows.find(row => row.ticker === ticker);

                    // 4. 수량 타이핑을 위한 모달 팝업창 빌드
                    const modal = new ModalBuilder()
                        .setCustomId(`sell_modal_${ticker}`)
                        .setTitle(`${targetHolding.name} (${ticker}) 매도 신청`);

                    const quantityInput = new TextInputBuilder()
                        .setCustomId('sell_quantity')
                        .setLabel(`매도 수량 입력 (보유: ${parseInt(targetHolding.quantity).toLocaleString()}주)`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder(`최대 ${targetHolding.quantity}까지 입력 가능`)
                        .setMinLength(1)
                        .setMaxLength(10)
                        .setRequired(true);

                    const modalRow = new ActionRowBuilder().addComponents(quantityInput);
                    modal.addComponents(modalRow);

                    // 모달 오픈
                    await i.showModal(modal);

                    // 5. 모달 제출 대기 및 실시간 연산 시작
                    try {
                        const modalSubmit = await i.awaitModalSubmit({
                            filter: (m) => m.customId === `sell_modal_${ticker}` && m.user.id === interaction.user.id,
                            time: 60000
                        });

                        const quantityStr = modalSubmit.fields.getTextInputValue('sell_quantity');
                        const quantity = parseInt(quantityStr, 10);

                        // 입력값 기본 검증
                        if (isNaN(quantity) || quantity <= 0) {
                            return await modalSubmit.reply({ content: '❌ 올바른 수량을 입력해 주세요. (1 이상의 숫자)', ephemeral: true });
                        }

                        // 💡 [동시성/악용 방지] 실시간 주가 및 유저의 실제 최신 보유 수량을 DB에서 재조회
                        const freshStock = await db.getStock(ticker);
                        const freshHoldingRes = await db.query(
                            'SELECT quantity FROM holdings WHERE user_id = $1 AND guild_id = $2 AND ticker = $3',
                            [userId, guildId, ticker]
                        );
                        
                        const currentOwned = freshHoldingRes.rows[0] ? BigInt(freshHoldingRes.rows[0].quantity) : BigInt(0);

                        // 가진 주식보다 더 많이 팔려고 하는지 철저하게 검증
                        if (currentOwned < BigInt(quantity)) {
                            return await modalSubmit.reply({
                                content: `❌ 보유 수량이 부족합니다!\n현재 보유: \`${currentOwned.toLocaleString()} 주\` | 입력 수량: \`${quantity.toLocaleString()} 주\``,
                                ephemeral: true
                            });
                        }

                        // 6. 판매 대금 정산 및 DB 반영
                        const totalEarnings = BigInt(freshStock.price) * BigInt(quantity);
                        const user = await db.checkUser(userId, guildId);

                        // 6-1. 보유 주식 수량 깎기
                        await db.query(
                            'UPDATE holdings SET quantity = quantity - $1 WHERE user_id = $2 AND guild_id = $3 AND ticker = $4',
                            [quantity, userId, guildId, ticker]
                        );

                        // 6-2. 유저 현금 잔고 채워주기
                        await db.query(
                            'UPDATE users SET cash = cash + $1 WHERE user_id = $2 AND guild_id = $3',
                            [totalEarnings.toString(), userId, guildId]
                        );

                        // 7. 결과 성공 임베드 전체 채널 전송
                        const sellEmbed = new EmbedBuilder()
                            .setTitle('📉 주식 매도 체결 성공')
                            .setDescription(`📊 **${freshStock.name} (${ticker})** 주식을 성공적으로 매도하여 정산했습니다.`)
                            .setColor(0xFF0000)
                            .addFields(
                                { name: '💵 체결 가격', value: `\`₩${freshStock.price.toLocaleString()}\` (1주)`, inline: true },
                                { name: '📦 매도 수량', value: `\`${quantity.toLocaleString()} 주\``, inline: true },
                                { name: '💰 총 환전 금액', value: `\`₩${totalEarnings.toLocaleString()}\``, inline: false },
                                { name: '👛 거래 후 잔액', value: `\`₩${(BigInt(user.cash) + totalEarnings).toLocaleString()}\``, inline: false }
                            )
                            .setTimestamp();

                        await modalSubmit.reply({ embeds: [sellEmbed] });

                        // 가이드 메시지 상자 청소
                        await interaction.editReply({ content: '✅ 주식 매도 프로세스가 완료되었습니다.', embeds: [], components: [] });
                        collector.stop();

                    } catch (modalError) {
                        // 입력 제한시간 초과 패스
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        await interaction.editReply({ content: '⏱️ 가동 시간이 만료되었습니다. 다시 명령어를 입력해 주세요.', embeds: [], components: [] });
                    } catch (e) {}
                }
            });

        } catch (error) {
            handleError(error, '주식매도 명령어 실행 중 에러 발생', interaction);
        }
    },
};