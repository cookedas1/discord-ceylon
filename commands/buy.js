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
    // 💡 입력 옵션을 전부 없애고 깔끔하게 명령어만 남깁니다.
    data: new SlashCommandBuilder()
        .setName('주식매수')
        .setDescription('시장에서 주식 종목을 선택하여 구매합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. DB에서 활성화된 모든 주식 종목 목록 가져오기
            const stocks = await db.getAllStocks();
            if (!stocks || Object.keys(stocks).length === 0) {
                return await interaction.reply({ content: '❌ 현재 시장에 상장된 주식 종목이 없습니다.', ephemeral: true });
            }

            // 2. 드롭다운(StringSelectMenu) 구성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('buy_stock_select')
                .setPlaceholder('📈 매수할 주식 종목을 선택해 주세요')
                .addOptions(
                    Object.keys(stocks).map(ticker => ({
                        label: `${stocks[ticker].name} (${ticker})`,
                        description: `현재가: ₩${stocks[ticker].price.toLocaleString()}`,
                        value: ticker
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🛒 주식 매수 센터')
                .setDescription('매수하려는 주식 종목을 선택해 주세요.')
                .setColor(0x5865F2);

            // 본인만 깔끔하게 보면서 선택할 수 있도록 ephemeral: true 처리
            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

            // 3. 유저가 메뉴를 골랐는지 감지하는 콜렉터 생성
            const collector = response.createMessageComponentCollector({
                time: 60000 // 1분간 대기
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ 본인의 매수 창에서만 선택할 수 있습니다.', ephemeral: true });
                }

                if (i.customId === 'buy_stock_select') {
                    const ticker = i.values[0];
                    const stockInfo = stocks[ticker];

                    // 4. 종목을 고르면 수량을 타이핑할 수 있는 모달(팝업창) 생성
                    const modal = new ModalBuilder()
                        .setCustomId(`buy_modal_${ticker}`)
                        .setTitle(`${stockInfo.name} (${ticker}) 매수 신청`);

                    const quantityInput = new TextInputBuilder()
                        .setCustomId('buy_quantity')
                        .setLabel('매수할 수량을 입력하세요 (정수만)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('예: 10')
                        .setMinLength(1)
                        .setMaxLength(10)
                        .setRequired(true);

                    const modalRow = new ActionRowBuilder().addComponents(quantityInput);
                    modal.addComponents(modalRow);

                    // 유저에게 모달 창을 띄워줌
                    await i.showModal(modal);

                    // 5. 모달 제출 버튼 클릭 대기 및 데이터 처리
                    try {
                        const modalSubmit = await i.awaitModalSubmit({
                            filter: (m) => m.customId === `buy_modal_${ticker}` && m.user.id === interaction.user.id,
                            time: 60000
                        });

                        const quantityStr = modalSubmit.fields.getTextInputValue('buy_quantity');
                        const quantity = parseInt(quantityStr, 10);

                        // 수량 검증
                        if (isNaN(quantity) || quantity <= 0) {
                            return await modalSubmit.reply({ content: '❌ 올바른 수량을 입력해 주세요. (1 이상의 숫자)', ephemeral: true });
                        }

                        // 최신 주가 및 유저 잔고 실시간 재조회
                        const freshStock = await db.getStock(ticker);
                        const user = await db.checkUser(userId, guildId);
                        const totalCost = BigInt(freshStock.price) * BigInt(quantity);

                        // 자산 비교
                        if (BigInt(user.cash) < totalCost) {
                            return await modalSubmit.reply({
                                content: `❌ 잔액이 부족합니다!\n필요 금액: \`₩${totalCost.toLocaleString()}\` | 보유 자산: \`₩${parseInt(user.cash).toLocaleString()}\``,
                                ephemeral: true
                            });
                        }

                        // 6. DB 트랜잭션 수동 처리 (보유금 차감 및 주식 추가)
                        await db.query(
                            'UPDATE users SET cash = cash - $1 WHERE user_id = $2 AND guild_id = $3',
                            [totalCost.toString(), userId, guildId]
                        );

                        await db.query(`
                            INSERT INTO holdings (user_id, guild_id, ticker, quantity)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (user_id, guild_id, ticker)
                            DO UPDATE SET quantity = holdings.quantity + EXCLUDED.quantity;
                        `, [userId, guildId, ticker, quantity]);

                        // 7. 최종 성공 임베드 리턴 (이건 채널 전체가 볼 수 있도록 일반 전송 가능)
                        const buyEmbed = new EmbedBuilder()
                            .setTitle('📈 주식 매수 체결 성공')
                            .setDescription(`📊 **${freshStock.name} (${ticker})** 주식 거래가 정상 체결되었습니다.`)
                            .setColor(0x00FF00)
                            .addFields(
                                { name: '💵 체결 가격', value: `\`₩${freshStock.price.toLocaleString()}\` (1주)`, inline: true },
                                { name: '📦 매수 수량', value: `\`${quantity.toLocaleString()} 주\``, inline: true },
                                { name: '💰 총 청구 금액', value: `\`₩${totalCost.toLocaleString()}\``, inline: false },
                                { name: '👛 거래 후 잔액', value: `\`₩${(BigInt(user.cash) - totalCost).toLocaleString()}\``, inline: false }
                            )
                            .setTimestamp();

                        await modalSubmit.reply({ embeds: [buyEmbed] });

                        // 사용이 끝난 드롭다운 안내 메시지 지우기
                        await interaction.editReply({ content: '✅ 주식 매수 프로세스가 완료되었습니다.', embeds: [], components: [] });
                        collector.stop();

                    } catch (modalError) {
                        // 모달 창 입력 시간 초과시 콘솔 에러 패스
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
            handleError(error, '주식매수 명령어 실행 중 에러 발생', interaction);
        }
    },
};