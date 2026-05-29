const { EmbedBuilder } = require('discord.js');

function handleError(error, context = '알 수 없는 오류', interaction = null) {
    const timestamp = new Date().toISOString();
    
    // 1. 개발자 보라고 터미널에 에러 로그 출력
    console.error(`[${timestamp}] ❌ 에러 발생 [위치/콘텍스트: ${context}]`);
    console.error(error);

    // 2. interaction 객체가 함께 넘어왔다면 유저에게 임베드 전송
    if (interaction) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('⚠️ 오류가 발생했습니다')
            .setDescription('오류가 발생했어요. 해당 오류가 지속된다면 **한입 스튜디오**에 문의해주세요.')
            .setColor(0xFF0000)
            .setTimestamp();

        const errorPayload = { embeds: [errorEmbed], ephemeral: true };

        // 봇이 이미 명령어에 응답(reply)했거나 대기(defer) 중인지 체크하여 전송
        if (interaction.replied || interaction.deferred) {
            interaction.followUp(errorPayload).catch(err => console.error('❌ 에러 임베드 전송 실패 (followUp):', err));
        } else {
            interaction.reply(errorPayload).catch(err => console.error('❌ 에러 임베드 전송 실패 (reply):', err));
        }
    }
}

module.exports = { handleError };