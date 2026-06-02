const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('출석')
        .setDescription('매일 출석체크하고 캐시를 받으세요! (연속 출석 시 보너스 지급)'),
        
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // DB에서 유저 정보 가져오기
        const userRes = await db.query('SELECT cash, last_attendance, attendance_combo FROM users WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
        const userData = userRes.rows[0];

        // 한국 시간(KST) 기준으로 오늘 날짜 구하기 (자정 리셋을 위해)
        const now = new Date();
        const krTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const today = krTime.toISOString().split('T')[0]; // "YYYY-MM-DD" 형태

        // 마지막 출석일 확인
        const lastAttendance = userData.last_attendance ? new Date(userData.last_attendance).toISOString().split('T')[0] : null;

        // 이미 오늘 출석했는지 차단
        if (lastAttendance === today) {
            return interaction.reply({ content: '❌ 오늘은 이미 출석하셨습니다! 내일 다시 와주세요.', ephemeral: true });
        }

        // 연속 출석 일수(combo) 계산
        let combo = 1; // 기본은 1일 차
        if (lastAttendance) {
            const lastDate = new Date(lastAttendance);
            const currentDate = new Date(today);
            
            // 날짜 차이 계산 (밀리초 단위 -> 일 단위로 변환)
            const diffTime = Math.abs(currentDate - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // 어제 출석했으면 콤보 이어가기!
                combo = (userData.attendance_combo || 0) + 1; 
            } 
            // 만약 2일 이상 차이 나면 콤보는 자동으로 1로 초기화됩니다.
        }

        // 💰 보상 계산 (기본 10,000 캐시 + 1일당 0.1배 추가)
        const baseReward = 10000;
        const bonusMultiplier = (combo - 1) * 0.1; // 1일차 0, 2일차 0.1, 3일차 0.2 ...
        const totalReward = Math.floor(baseReward * (1 + bonusMultiplier));
        const bonusReward = totalReward - baseReward; // 순수 보너스 금액

        // DB 업데이트 (돈, 마지막 출석일, 연속 출석 횟수 저장)
        await db.query(
            'UPDATE users SET cash = cash + $1, last_attendance = $2, attendance_combo = $3 WHERE user_id = $4 AND guild_id = $5',
            [totalReward, today, combo, userId, guildId]
        );

        // 화려한 결과 임베드
        const embed = new EmbedBuilder()
            .setTitle('✅ 출석 체크 완료!')
            .setColor('#00FF00')
            .setDescription(`<@${userId}>님, 환영합니다!`)
            .addFields(
                { name: '🔥 연속 출석', value: `**${combo}일** 연속!`, inline: true },
                { name: '💰 획득 캐시', value: `**${totalReward.toLocaleString()} 캐시**`, inline: true },
                { name: '📊 상세 내역', value: `기본 ${baseReward.toLocaleString()} + 보너스 ${bonusReward.toLocaleString()}`, inline: false }
            )
            .setFooter({ text: '내일도 출석하고 더 큰 보너스를 받으세요!' });

        await interaction.reply({ embeds: [embed] });
        const logger = require('../utils/logger');
        logger.sendAdminLog(
            interaction.client, 
            '🏦 신용 대출 실행 완료', 
            `• **대출자:** <@${userId}> (\`${userId}\`)\n• **실행 서버:** ${interaction.guild.name}\n• **대출 금액:** +${amount.toLocaleString()}원`,
            '#FFCC00' // 임베드 색상 노란색으로 지정
        );
    }
};