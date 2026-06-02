const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const path = require('path');
const fs = require('fs');
const { handleError } = require('../utils/errorHandler'); // 💡 우리의 만능 에러 핸들러

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('📢 [전 서버 공통] 오늘의 주식 시장 대격변 뉴스를 확인하거나 새로 발행합니다!'),

    async execute(interaction) {
        const now = new Date();
        const krTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const todayStr = krTime.toISOString().split('T')[0];

        try {
            // 1. 🔒 DB에서 '마지막 뉴스 날짜'와 '저장된 뉴스 내용' 가져오기
            const settingsRes = await db.query(
                "SELECT key, value FROM global_settings WHERE key IN ('last_news_date', 'current_news_json')"
            );
            
            const settings = {};
            settingsRes.rows.forEach(row => {
                settings[row.key] = row.value;
            });

            const lastNewsDate = settings['last_news_date'];
            const currentNewsJson = settings['current_news_json'];

            // 2. 🔄 [오늘 이미 뉴스가 발행된 경우] -> 저장된 뉴스 리플레이
            if (lastNewsDate === todayStr && currentNewsJson && currentNewsJson !== '{}') {
                const savedNews = JSON.parse(currentNewsJson);

                const embed = new EmbedBuilder()
                    .setTitle(`📰 [실론 타임즈 - 오늘의 단독 속보]`)
                    .setDescription(`### ${savedNews.title}\n\n${savedNews.desc}`)
                    .setColor(savedNews.embedColor)
                    .addFields(
                        { name: '🏢 대상 종목', value: `**${savedNews.companyName} (${savedNews.stockTicker})**`, inline: true },
                        { name: '📊 오늘의 변동률', value: `**${savedNews.rateString}**`, inline: true },
                        { name: '💰 변동된 주가', value: `~~${savedNews.currentPrice.toLocaleString()}~~ 원 ➡️ **${savedNews.newPrice.toLocaleString()} 원**`, inline: false }
                    )
                    .setFooter({ text: '⚠️ 본 뉴스는 오늘 하루 동안 전 서버에 동일하게 유지됩니다.' })
                    .setTimestamp();

                return await interaction.reply({ embeds: [embed] });
            }

            // 3. 📂 [예외 체크 1] utils/news.json 파일이 없을 때 -> errorHandler 틀 적용!
            const jsonPath = path.join(__dirname, '../utils/news.json');
            if (!fs.existsSync(jsonPath)) {
                return handleError(
                    new Error('utils/news.json 파일을 찾을 수 없습니다.'), 
                    '뉴스 설정 파일 로드 실패', 
                    interaction
                );
            }
            
            const newsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

            // 4. 🏢 [예외 체크 2] 상장된 주식 종목이 없을 때 -> errorHandler 틀 적용!
            const stockListRes = await db.query('SELECT ticker, name, price FROM stocks');
            if (stockListRes.rows.length === 0) {
                return handleError(
                    new Error('현재 상장된 주식 종목이 없습니다.'), 
                    'DB 상장 종목 조회 실패', 
                    interaction
                );
            }

            // 랜덤 종목 및 호재/악재 결정
            const targetStock = stockListRes.rows[Math.floor(Math.random() * stockListRes.rows.length)];
            const companyName = targetStock.name;
            const currentPrice = targetStock.price;
            const stockTicker = targetStock.ticker;

            const isUp = Math.random() > 0.5;
            const templates = isUp ? newsData.up : newsData.down;
            
            // 5. 📑 [예외 체크 3] JSON 내부에 템플릿 배열이 비어있을 때 -> errorHandler 틀 적용!
            if (!templates || templates.length === 0) {
                return handleError(
                    new Error('json 파일에 뉴스 템플릿이 정의되어 있지 않습니다.'), 
                    '뉴스 템플릿 매칭 실패', 
                    interaction
                );
            }
            
            const selectedNews = templates[Math.floor(Math.random() * templates.length)];

            // 변동폭 설정
            const impactMultiplier = isUp 
                ? parseFloat((1.3 + Math.random() * 0.2).toFixed(2)) 
                : parseFloat((0.5 + Math.random() * 0.2).toFixed(2));

            let newPrice = Math.floor(currentPrice * impactMultiplier);
            if (newPrice < 100) newPrice = 100; // 동전주 방지

            const changeRate = Math.round((impactMultiplier - 1) * 100);
            const rateString = isUp ? `▲ +${changeRate}%` : `▼ ${changeRate}%`;
            const embedColor = isUp ? '#FF0000' : '#0000FF';

            const finalTitle = selectedNews.title.replace(/{company}/g, companyName);
            const finalDesc = selectedNews.desc.replace(/{company}/g, companyName);

            const newsObj = {
                title: finalTitle,
                desc: finalDesc,
                companyName: companyName,
                stockTicker: stockTicker,
                currentPrice: currentPrice,
                newPrice: newPrice,
                rateString: rateString,
                embedColor: embedColor
            };

            // 6. 📝 DB 대형 업데이트
            await db.query('UPDATE stocks SET price = $1 WHERE ticker = $2', [newPrice, stockTicker]);
            await db.query("UPDATE global_settings SET value = $1 WHERE key = 'last_news_date'", [todayStr]);
            await db.query("UPDATE global_settings SET value = $1 WHERE key = 'current_news_json'", [JSON.stringify(newsObj)]);

            // 7. 📢 최초 발행 임베드 출력
            const embed = new EmbedBuilder()
                .setTitle(`📰 [실론 타임즈 - 오늘의 단독 속보]`)
                .setDescription(`### ${finalTitle}\n\n${finalDesc}`)
                .setColor(embedColor)
                .addFields(
                    { name: '🏢 대상 종목', value: `**${companyName} (${stockTicker})**`, inline: true },
                    { name: '📊 오늘의 변동률', value: `**${rateString}**`, inline: true },
                    { name: '💰 변동된 주가', value: `~~${currentPrice.toLocaleString()}~~ 원 ➡️ **${newPrice.toLocaleString()} 원**`, inline: false }
                )
                .setFooter({ text: '⚠️ 본 뉴스는 하루에 단 한 번만 새롭게 발행되는 특종입니다.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            const logger = require('../utils/logger');
logger.sendAdminLog(
                interaction.client, 
                '뉴스 발행 완료', 
                `• **뉴스 제목:** ${finalTitle}\n• **실행 서버:** ${interaction.guild.name}\n• **대상 종목:** ${companyName} (${stockTicker})`,
                '#FFCC00' // 임베드 색상 노란색으로 지정
            );

        } catch (error) {
            // 시스템 런타임 에러 처리
            return handleError(error, '뉴스 시스템 실행 중 치명적 오류 발생', interaction);
        }
    }
};