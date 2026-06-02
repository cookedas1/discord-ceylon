const { EmbedBuilder } = require('discord.js');

// ⚙️ 개발자님의 본부 서버 정보 세팅
const ADMIN_GUILD_ID = '1470614389232107602';
const ADMIN_CHANNEL_ID = '1511327457687634031'; // 유저님이 말씀하신 전용 채널 ID

/**
 * 전서버 관리용 실시간 어드민 로그 전송 함수
 * @param {import('discord.js').Client} client 디스코드 클라이언트 객체
 * @param {string} title 로그 제목
 * @param {string} description 로그 상세 내용
 * @param {string} [color] 임베드 색상 (기본값: #00FF00)
 */
function sendAdminLog(client, title, description, color = '#00FF00') {
    try {
        // 1. 본부 서버 가져오기
        const adminGuild = client.guilds.cache.get(ADMIN_GUILD_ID);
        if (!adminGuild) return console.log(`[⚠️ 어드민 로그 경고] 본부 서버(${ADMIN_GUILD_ID})를 찾을 수 없습니다.`);

        // 2. 지정된 로그 채널 가져오기
        const logChannel = adminGuild.channels.cache.get(ADMIN_CHANNEL_ID);
        if (!logChannel) return console.log(`[⚠️ 어드민 로그 경고] 로그 채널(${ADMIN_CHANNEL_ID})을 찾을 수 없습니다.`);

        // 3. 로그 임베드 조립
        const logEmbed = new EmbedBuilder()
            .setTitle(`⚙️ [SYSTEM LOG] ${title}`)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        // 4. 채널로 전송
        logChannel.send({ embeds: [logEmbed] }).catch(err => {
            console.error('[❌ 로그 전송 실패]', err);
        });

    } catch (error) {
        console.error('[❌ 어드민 로그 모듈 에러]', error);
    }
}

module.exports = { sendAdminLog };