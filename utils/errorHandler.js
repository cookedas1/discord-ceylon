/** Copyright (C) 2026 HaniB Studio (nageune1010@gmail.com)
 
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
 
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.
 
You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

const { EmbedBuilder } = require('discord.js');

/**
 * 전역 에러 핸들러 모듈
 * @param {Error} error 발생한 에러 객체
 * @param {string} context 에러가 발생한 상황 설명
 * @param {import('discord.js').Interaction} interaction 디스코드 인터랙션 객체
 */
function handleError(error, context, interaction) {
    // 1. 🚨 터미널 및 Render 로그에 무조건 에러 강제 출력! (로그 안 뜨던 문제 해결)
    console.error(`\n[🚨 SYSTEM ERROR] --------------------------------0`);
    console.error(`📅 발생 시간: ${new Date().toISOString()}`);
    console.error(`📂 발생 위치: ${context}`);
    console.error(`💬 에러 내용:`, error);
    console.error(`--------------------------------------------------\n`);

    // 디스코드 글자 수 제한(1024자)을 넘지 않도록 안전하게 자르기
    const errorMessage = error.message || String(error);
    const errorStack = error.stack ? error.stack.slice(0, 800) : '스택 정보 없음';

    // 2. 💻 개발자용 디버깅 정보가 포함된 화려한 오류 임베드 생성
    const errorEmbed = new EmbedBuilder()
        .setTitle('❌ 시스템 작동 중 오류가 발생했습니다')
        .setDescription(`**상황:** \`${context}\`\n소스 코드 내부에서 문제가 발생하여 명령어를 완료하지 못했습니다.`)
        .setColor('#FF3333')
        .addFields(
            { 
                name: '💬 에러 메시지 (Error Message)', 
                value: `\`\`\`text\n${errorMessage}\n\`\`\`` 
            },
            { 
                name: '💻 에러 스택 코드 (Stack Trace 일부)', 
                value: `\`\`\`js\n${errorStack}\n\`\`\`` 
            }
        )
        .setFooter({ text: '실론 개발실 • 실시간 디버깅 모드 가동 중' })
        .setTimestamp();

    // 3. 🛡️ 인터랙션 상태(이미 응답했는지 등)를 체크하여 안전하게 답변 전송
    if (interaction) {
        // 비밀 메시지(ephemeral)로 보내서 일반 유저들에게는 안 보이고 명령어 친 사람(테스트 중인 유저님) 눈에만 보이게 합니다.
        if (interaction.replied || interaction.deferred) {
            interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch((err) => {
                console.error('오류 임베드 followUp 전송 실패:', err);
            });
        } else {
            interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch((err) => {
                console.error('오류 임베드 reply 전송 실패:', err);
            });
        }
    }
}

module.exports = { handleError };