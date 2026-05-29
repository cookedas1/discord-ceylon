const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('프로필')
        .setDescription('자신의 프로필 정보와 보유 코인을 확인합니다.'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. DB에서 유저 정보(보유 코인, 가입일) 가져오기
            const user = await db.checkUser(userId, guildId);

            if (!user) {
                return await interaction.reply({
                    content: '❌ 가입 정보가 없습니다. 먼저 `/가입` 명령어를 이용해주세요.',
                    ephemeral: true
                });
            }

            // 2. 가입 날짜 이쁘게 포맷팅 (예: 2026년 5월 27일)
            // 만약 컬럼 추가 전 기존 유저라 값이 비어있다면 현재 시간으로 대체 처리
            const rawDate = user.joined_at ? new Date(user.joined_at) : new Date();
            const formattedDate = `${rawDate.getFullYear()}년 ${rawDate.getMonth() + 1}월 ${rawDate.getDate()}일`;

            // 3. 디스코드 서버 닉네임 가져오기 (서버 닉네임이 없으면 계정 디스플레이 네임)
            const nickname = interaction.member ? interaction.member.displayName : interaction.user.displayName;

            // 4. 프로필 임베드 생성
            const embed = new EmbedBuilder()
                .setTitle(`👤 ${nickname}님의 프로필`)
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false, size: 512 }))
                .setColor(0x5865F2)
                .addFields(
                    { name: '🪙 보유 코인', value: `\`₩${parseInt(user.cash).toLocaleString()}\``, inline: false },
                    { name: '📅 가입 날짜', value: `\`${formattedDate}\``, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            handleError(error, '프로필 명령어 실행 중 에러 발생', interaction);
        }
    },
};