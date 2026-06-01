const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler'); // 💡 에러 핸들러 임포트

module.exports = {
    data: new SlashCommandBuilder()
        .setName('주가')
        .setDescription('시장의 종목 시세를 확인합니다.'),
    
    async execute(interaction) {
        try {
            // PostgreSQL 데이터베이스에서 전체 종목 가져오기
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
                try {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: '❌ 본인의 메뉴판만 조작할 수 있습니다.', ephemeral: true });
                    }

                    const selectedTicker = i.values[0];
                    // PostgreSQL 데이터베이스에서 단일 종목 실시간 조회
                    const stock = await db.getStock(selectedTicker);

                    if (!stock) {
                        return await i.update({ content: '⚠️ 존재하지 않는 종목입니다.', components: [] });
                    }

                    // 📈 1. DB에서 최근 주가 히스토리 배열 파싱 (데이터가 비어있다면 현재가로 임시 배열 생성)
                    const priceHistory = stock.history ? stock.history.split(',').map(Number) : [stock.price];
                    
                    // 차트의 X축 레이블 만들기 (1회차, 2회차, 3회차...)
                    const labels = priceHistory.map((_, index) => `${index + 1}회차`);

                    // 🎨 2. QuickChart API 선 그래프(Line Chart) 설정 구성
                    const chartConfig = {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: `${stock.name} 최근 주가 흐름`,
                                data: priceHistory,
                                borderColor: '#FF4500', // 간지나는 오렌지레드 색상 선
                                backgroundColor: 'rgba(255, 69, 0, 0.1)', // 선 아래 투명한 채우기 색상
                                fill: true,
                                tension: 0.3 // 꺾은선 그래프를 부드러운 곡선으로 튜닝
                            }]
                        },
                        options: {
                            plugins: {
                                legend: { labels: { fontColor: '#FFFFFF' } } // 디스코드 다크모드 가독성을 위한 흰색 글씨
                            }
                        }
                    };

                    // URL 인코딩을 거쳐 임베드 전용 차트 이미지 링크 생성
                    const chartUrl = `https://quickchart.io/chart?bkg=rgba(47,49,54,1)&w=500&h=300&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

                    // 🖼️ 3. 차트가 포함된 멋진 시세 정보 임베드 빌드
                    const embed = new EmbedBuilder()
                        .setTitle(`📈 [${selectedTicker}] ${stock.name} 시세`)
                        .setDescription(`실시간으로 변동하는 주식 시장의 시세와 차트 흐름입니다.`)
                        .addFields(
                            { name: '💰 현재가', value: `**₩${stock.price.toLocaleString()}**`, inline: true },
                            { name: '📊 변동 기록', value: `최근 \`${priceHistory.length}\`개 구간 수집됨`, inline: true }
                        )
                        .setColor(0x00FF00)
                        .setImage(chartUrl) // 🔥 여기에 차트 URL을 박아주면 임베드 하단에 그래프가 그려집니다!
                        .setTimestamp()
                        .setFooter({ text: '실론 모의주식 거래소 • 30초마다 갱신됨' });

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
                
                } catch (innerError) {
                    return handleError(innerError, '주가 메뉴 컴포넌트 수집 처리 중 오류 발생', i);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        await interaction.editReply({
                            content: '⏱️ 조회 시간이 만료되었습니다. 다시 명령어를 입력해 주세요.',
                            components: []
                        });
                    } catch (err) {
                        // 시간 만료 시 메시지가 이미 지워졌거나 유저가 닫았을 때 발생하는 사소한 에러 방지
                    }
                }
            });

        } catch (error) {
            return handleError(error, '주가 명령어 실행 중 치명적 오류 발생', interaction);
        }
    },
};