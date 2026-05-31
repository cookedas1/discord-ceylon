const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('주가')
        .setDescription('시장의 종목 시세를 확인합니다.'),
    
    async execute(interaction) {
        // PostgreSQL 데이터베이스에서 전체 종목 가져오기 (await 추가)
        const allStocks = await db.getAllStocks();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('stock_select')
            .setPlaceholder('💡 시세를 조회할 주식 종목을 선택하세요')
            .addOptions(
                Object.keys(allStocks).map(ticker => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${allStocks[ticker].name} (${ticker})`)
                        .setDescription(`₩${allStocks[ticker].price.toLocaleString()} 현재가`)
                        .setValue(ticker)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: '📊 주가 조회 메뉴',
            components: [row],
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ 본인의 메뉴판만 조작할 수 있습니다.', ephemeral: true });
            }

            const selectedTicker = i.values[0];
            // PostgreSQL 데이터베이스에서 단일 종목 실시간 조회 (await 추가)
            const stock = await db.getStock(selectedTicker);

            if (!stock) {
                return await i.update({ content: '⚠️ 존재하지 않는 종목입니다.', components: [] });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📈 [${selectedTicker}] ${stock.name} 시세`)
                .setDescription(`실시간으로 변동하는 주식 시장의 시세입니다.`)
                .addFields({ name: '현재가', value: `₩${stock.price.toLocaleString()}` })
                .setColor(0x00FF00)
                .setTimestamp();

            // 유저가 다른 종목을 연달아 드래그 선택할 수 있도록 데이터 최신화 후 메뉴 컴포넌트 유지
            const currentStocks = await db.getAllStocks();
            const updatedSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('stock_select')
                .setPlaceholder('💡 시세를 조회할 주식 종목을 선택하세요')
                .addOptions(
                    Object.keys(currentStocks).map(t => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${currentStocks[t].name} (${t})`)
                            .setDescription(`₩${currentStocks[t].price.toLocaleString()} 현재가`)
                            .setValue(t)
                    )
                );
            const updatedRow = new ActionRowBuilder().addComponents(updatedSelectMenu);

            await i.update({ content: '조회가 완료되었습니다.', embeds: [embed], components: [updatedRow] });
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await interaction.editReply({
                    content: '⏱️ 조회 시간이 만료되었습니다. 다시 명령어를 입력해 주세요.',
                    components: []
                });
            }
        });
    },
};