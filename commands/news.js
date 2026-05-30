const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('📢 [전 서버 공통] 하루에 단 한 번, 주식 시장에 대격변을 일으키는 뉴스를 발표합니다!'),

    async execute(interaction) {
        // 1. ⏰ 한국 시간(KST) 기준 오늘 날짜 구하기
        const now = new Date();
        const krTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const todayStr = krTime.toISOString().split('T')[0];

        try {
            // 2. 🔒 DB에서 마지막 뉴스 발행일 조회 및 하루 제한 체크
            const settingRes = await db.query("SELECT value FROM global_settings WHERE key = 'last_news_date'");
            const lastNewsDate = settingRes.rows[0]?.value;

            if (lastNewsDate === todayStr) {
                return await interaction.reply({ 
                    content: '🛑 **[공고]** 오늘의 경제 뉴스는 이미 발행되었습니다! 주식 시장은 내일 자정 이후 새로운 뉴스를 맞이하게 됩니다. 💸', 
                    ephemeral: true 
                });
            }

            // 3. 📂 utils/news.json 파일 실시간으로 읽어오기
            const jsonPath = path.join(__dirname, '../utils/news.json');
            if (!fs.existsSync(jsonPath)) {
                return await interaction.reply({ content: '❌ `utils/news.json` 파일을 찾을 수 없습니다.', ephemeral: true });
            }
            
            // require 대신 fs를 사용해 읽어야 봇을 재시작하지 않고 JSON을 고쳐도 실시간 반영됩니다!
            const newsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

            // 4. 🏢 상장된 주식 종목 가져오기
            const stockListRes = await db.query('SELECT company_name, price FROM stocks');
            if (stockListRes.rows.length === 0) {
                return await interaction.reply({ content: '❌ 현재 상장된 주식 종목이 없습니다.', ephemeral: true });
            }

            // 5. 랜덤 종목 및 호재/악재 결정
            const targetStock = stockListRes.rows[Math.floor(Math.random() * stockListRes.rows.length)];
            const companyName = targetStock.company_name;
            const currentPrice = targetStock.price;

            const isUp = Math.random() > 0.5;
            const templates = isUp ? newsData.up : newsData.down;
            
            if (!templates || templates.length === 0) {
                return await interaction.reply({ content: '❌ JSON 파일에 뉴스 템플릿이 정의되어 있지 않습니다.', ephemeral: true });
            }
            
            const selectedNews = templates[Math.floor(Math.random() * templates.length)];

            // 변동폭 설정 (폭등 1.3~1.5배 / 폭락 0.5~0.7배)
            const impactMultiplier = isUp 
                ? parseFloat((1.3 + Math.random() * 0.2).toFixed(2)) 
                : parseFloat((0.5 + Math.random() * 0.2).toFixed(2));

            const newPrice = Math.floor(currentPrice * impactMultiplier);
            const changeRate = Math.round((impactMultiplier - 1) * 100);
            const rateString = isUp ? `▲ +${changeRate}%` : `▼ ${changeRate}%`;
            const embedColor = isUp ? '#FF0000' : '#0000FF';

            // 6. 📝 DB의 stocks 테이블에 변동된 주가 및 날짜 락 반영
            await db.query('UPDATE stocks SET price = $1 WHERE company_name = $2', [newPrice, companyName]);
            await db.query("UPDATE global_settings SET value = $1 WHERE key = 'last_news_date'", [todayStr]);

            // 7. 📢 전 서버 공통 찌라시 임베드 출력
            const finalTitle = selectedNews.title.replace(/{company}/g, companyName);
            const finalDesc = selectedNews.desc.replace(/{company}/g, companyName);

            const embed = new EmbedBuilder()
                .setTitle(`📰 [실론 타임즈 - 오늘의 단독 속보]`)
                .setDescription(`### ${finalTitle}\n\n${finalDesc}`)
                .setColor(embedColor)
                .addFields(
                    { name: '🏢 대상 종목', value: `**${companyName}**`, inline: true },
                    { name: '📊 오늘의 변동률', value: `**${rateString}**`, inline: true },
                    { name: '💰 변동된 주가', value: `~~${currentPrice.toLocaleString()}~~ 원 ➡️ **${newPrice.toLocaleString()} 원**`, inline: false }
                )
                .setFooter({ text: '⚠️ 본 뉴스는 하루에 단 한 번만 발행되는 한정판 특종입니다.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('뉴스 생성 중 치명적 오류:', error);
            await interaction.reply({ content: '❌ 뉴스 시스템 작동 중 오류가 발생했습니다.', ephemeral: true });
        }
    }
};