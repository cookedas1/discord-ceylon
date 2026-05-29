const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('랭킹')
        .setDescription('서버 내 자산 순위(Top 10)를 확인합니다.'),
    async execute(interaction) {
        const guildId = interaction.guildId;

        try {
            // 1. DB에서 현재 실시간 주가 정보 통째로 가져오기 (CEYLON, HANIP 등)
            const stockMap = await db.getAllStocks();
            
            // 2. DB에서 서버 유저 데이터 및 주식 보유 데이터 가져오기
            const data = await db.getLeaderboardData(guildId);
            if (!data || data.users.length === 0) {
                return await interaction.reply({ content: '📊 아직 가입한 유저가 없거나 데이터를 불러올 수 없습니다.', ephemeral: true });
            }

            // 3. 유저별 총 자산 계산 (현금 + DB 실시간 주가 적용 평가액)
            const leaderboard = data.users.map(user => {
                // 해당 유저가 가진 주식들만 필터링
                const userHoldings = data.holdings.filter(h => h.user_id === user.user_id);
                
                // DB에서 긁어온 진짜 주가를 매칭해서 가치 합산
                const stockValue = userHoldings.reduce((sum, holding) => {
                    const stock = stockMap[holding.ticker.toUpperCase()]; // 대문자 매칭 안전장치
                    const currentPrice = stock ? Number(stock.price) : 0; 
                    return sum + (Number(holding.quantity) * currentPrice);
                }, 0);

                const totalAssets = Number(user.cash) + stockValue;

                return {
                    userId: user.user_id,
                    cash: Number(user.cash),
                    stockValue: stockValue,
                    totalAssets: totalAssets
                };
            });

            // 4. 총 자산 기준 내림차순 정렬 (돈 많은 순)
            leaderboard.sort((a, b) => b.totalAssets - a.totalAssets);

            // 상위 10명만 커트
            const top10 = leaderboard.slice(0, 10);

            // 5. 랭킹 텍스트 포맷팅 (쉼표 및 메달 추가)
            const rankingList = top10.map((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`${index + 1}등\``;
                return `${medal} <@${user.userId}> | **총 자산:** ₩${user.totalAssets.toLocaleString()}\n` +
                       `> 💵 현금: ₩${user.cash.toLocaleString()} | 📈 주식: ₩${user.stockValue.toLocaleString()}`;
            }).join('\n\n');

            // 6. 수정하신 톤앤매너 임베드 송출
            const embed = new EmbedBuilder()
                .setTitle('🏆 실론 모의주식 자산 랭킹 (Top 10)')
                .setDescription(`서버 최고의 투자 고수들을 공개합니다!\n*(총 자산 = 현금 + 보유 주식의 현재 가치)*\n\n${rankingList}`)
                .setColor('#FFD700') 
                .setTimestamp()
                .setFooter({ text: 'by 한입 스튜디오' });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            handleError(error, '랭킹 명령어 실행 중 에러 발생', interaction);
        }
    }
};